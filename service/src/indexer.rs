// Mirrors every live Olien account from its events (06-algorithms.md §8): executions,
// schedules, vetoes, approvals, cancellations, signer and rule changes, spending
// limits, sub-accounts, and USDC transfers into the ledger. The chain decides; this
// job only writes down what it said, then recomputes the queue's derived states.

use alloy::primitives::{Address, B256, U256};
use alloy::rpc::types::Log;
use alloy::sol_types::SolEvent;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tracing::{info, warn};

use crate::services::olien::{IOlien, OlienClient, IERC20, PATH_RECOVERY, PATH_SINGLE, SCHEDULE_WINDOW};
use crate::services::treasury::{self, AccountRow, RelayerStatus};

// drpc caps a getLogs answer at 10k entries; a fresh account has few logs, so a large
// block window is safe and catches up fast.
const CHUNK_BLOCKS: u64 = 5_000;
const MAX_CHUNKS_PER_CYCLE: u64 = 50;

/// Below this the relayer cannot be trusted to pay for the next creation or execution.
pub const RELAYER_LOW_USDC: u128 = 5_000_000;

pub async fn run(client: OlienClient, pool: PgPool, interval_secs: u64, relayer: Arc<Mutex<Option<RelayerStatus>>>) {
    let mut ticker = tokio::time::interval(Duration::from_secs(interval_secs.max(5)));
    let mut cycles: u64 = 0;
    loop {
        ticker.tick().await;
        // Every sixth cycle, about a minute: the relayer pays for every creation and
        // execution, so an emptying key is a warning here before it is a failed execute.
        if cycles.is_multiple_of(6) {
            watch_relayer(&client, &relayer).await;
        }
        cycles += 1;
        if let Err(e) = index_once(&client, &pool).await {
            warn!("olien index cycle failed: {e:#}");
        }
    }
}

async fn watch_relayer(client: &OlienClient, status: &Arc<Mutex<Option<RelayerStatus>>>) {
    match client.usdc_balance(client.relayer()).await {
        Ok(balance) => {
            let units: u128 = balance.try_into().unwrap_or(u128::MAX);
            let low = units < RELAYER_LOW_USDC;
            if low {
                warn!(
                    "relayer {:#x} holds {:.2} USDC, below the {:.0} USDC floor: fund it or executions will fail",
                    client.relayer(),
                    units as f64 / 1e6,
                    RELAYER_LOW_USDC as f64 / 1e6
                );
            }
            if let Ok(mut slot) = status.lock() {
                *slot = Some(RelayerStatus {
                    address: format!("{:#x}", client.relayer()),
                    usdc_balance: units.to_string(),
                    low,
                    checked_at: chrono::Utc::now().timestamp(),
                });
            }
        }
        Err(e) => warn!("could not read the relayer balance: {e:#}"),
    }
}

async fn index_once(client: &OlienClient, pool: &PgPool) -> anyhow::Result<()> {
    let accounts: Vec<AccountRow> =
        sqlx::query_as("SELECT * FROM olien_accounts WHERE status = 'live' ORDER BY id").fetch_all(pool).await?;
    if accounts.is_empty() {
        return Ok(());
    }
    let head = client.block_number().await?;
    for account in accounts {
        if let Err(e) = index_account(client, pool, &account, head).await {
            warn!("indexing {} failed: {e:#}", account.address);
        }
    }
    Ok(())
}

fn hex(bytes: &[u8]) -> String {
    format!("0x{}", alloy::hex::encode(bytes))
}

fn addr(address: Address) -> String {
    format!("{address:#x}")
}

async fn index_account(client: &OlienClient, pool: &PgPool, account: &AccountRow, head: u64) -> anyhow::Result<()> {
    let address = account.address();
    let mut from = (account.indexed_block.max(0) as u64) + 1;
    let mut chunks = 0;
    let mut config_changed = false;
    let mut timestamps: HashMap<u64, u64> = HashMap::new();
    while from <= head && chunks < MAX_CHUNKS_PER_CYCLE {
        let to = (from + CHUNK_BLOCKS - 1).min(head);
        let logs = client.account_logs(address, from, to).await?;
        for log in &logs {
            match apply(client, pool, account, log, &mut timestamps).await {
                Ok(touched_config) => config_changed |= touched_config,
                Err(e) => warn!("log {:?}/{:?} on {} skipped: {e:#}", log.transaction_hash, log.log_index, account.address),
            }
        }
        sqlx::query("UPDATE olien_accounts SET indexed_block = $2 WHERE id = $1")
            .bind(account.id)
            .bind(to as i64)
            .execute(pool)
            .await?;
        if !logs.is_empty() {
            info!("{}: {} logs in blocks {from}..{to}", account.address, logs.len());
        }
        from = to + 1;
        chunks += 1;
    }
    // Balances and lanes move without an event of the account's own (an incoming
    // transfer, a user operation), so they are re-read every cycle; signers and rules
    // only when an event said they changed.
    if config_changed {
        treasury::refresh_account_from_chain(pool, client, account).await?;
    } else {
        refresh_balances_and_lanes(client, pool, account).await?;
    }
    let fresh = treasury::load_account_by_id(pool, account.id).await.map_err(|e| anyhow::anyhow!("{}", e.parts().1))?;
    treasury::refresh_statuses(pool, &fresh).await.map_err(|e| anyhow::anyhow!("{}", e.parts().1))?;
    Ok(())
}

async fn refresh_balances_and_lanes(client: &OlienClient, pool: &PgPool, account: &AccountRow) -> anyhow::Result<()> {
    let address = account.address();
    let balance = client.usdc_balance(address).await?;
    let deposit = client.entry_point_deposit(address).await?;
    sqlx::query("UPDATE olien_accounts SET usdc_balance = $2, entry_point_deposit = $3 WHERE id = $1")
        .bind(account.id)
        .bind(balance.to_string())
        .bind(deposit.to_string())
        .execute(pool)
        .await?;
    let lanes: Vec<(String,)> = sqlx::query_as("SELECT nonce_key FROM olien_lanes WHERE olien_id = $1").bind(account.id).fetch_all(pool).await?;
    for (key,) in lanes {
        let sequence = client.nonce(address, U256::from_str_radix(&key, 10).unwrap_or(U256::ZERO)).await?;
        sqlx::query("UPDATE olien_lanes SET chain_sequence = $3 WHERE olien_id = $1 AND nonce_key = $2")
            .bind(account.id)
            .bind(&key)
            .bind(sequence as i64)
            .execute(pool)
            .await?;
    }
    Ok(())
}

async fn block_time(client: &OlienClient, cache: &mut HashMap<u64, u64>, number: u64) -> anyhow::Result<u64> {
    if let Some(t) = cache.get(&number) {
        return Ok(*t);
    }
    let t = client.block_timestamp(number).await?;
    cache.insert(number, t);
    Ok(t)
}

async fn proposal_id(pool: &PgPool, olien_id: i64, hash: B256) -> anyhow::Result<Option<(i64, String, i64, String)>> {
    Ok(sqlx::query_as::<_, (i64, String, i64, String)>(
        "SELECT id, nonce_key, sequence, status FROM olien_proposals WHERE olien_id = $1 AND tx_hash = $2",
    )
    .bind(olien_id)
    .bind(hex(hash.as_slice()))
    .fetch_optional(pool)
    .await?)
}

/// Applies one log. Returns whether it changed who decides or the rules, which means
/// the signer set and config must be re-read from the chain.
async fn apply(client: &OlienClient, pool: &PgPool, account: &AccountRow, log: &Log, timestamps: &mut HashMap<u64, u64>) -> anyhow::Result<bool> {
    let Some(topic0) = log.topic0().copied() else { return Ok(false) };
    let tx = hex(log.transaction_hash.unwrap_or_default().as_slice());
    let block = log.block_number.unwrap_or_default();
    let address = account.address();

    if log.address() == client.usdc {
        if topic0 != IERC20::Transfer::SIGNATURE_HASH {
            return Ok(false);
        }
        let event = IERC20::Transfer::decode_log(&log.inner)?;
        let (direction, counterparty) = if event.to == address { ("in", event.from) } else { ("out", event.to) };
        let time = block_time(client, timestamps, block).await?;
        let proposal: Option<(i64,)> =
            sqlx::query_as("SELECT id FROM olien_proposals WHERE olien_id = $1 AND executed_tx = $2").bind(account.id).bind(&tx).fetch_optional(pool).await?;
        sqlx::query(
            "INSERT INTO olien_ledger (olien_id, tx, log_index, token, direction, counterparty, amount, block_number, block_time, proposal_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (tx, log_index) DO NOTHING",
        )
        .bind(account.id)
        .bind(&tx)
        .bind(log.log_index.unwrap_or_default() as i32)
        .bind(addr(client.usdc))
        .bind(direction)
        .bind(addr(counterparty))
        .bind(event.value.to_string())
        .bind(block as i64)
        .bind(time as i64)
        .bind(proposal.map(|p| p.0))
        .execute(pool)
        .await?;
        return Ok(false);
    }

    if log.address() != address {
        return Ok(false);
    }

    match topic0 {
        t if t == IOlien::Executed::SIGNATURE_HASH => {
            let event = IOlien::Executed::decode_log(&log.inner)?;
            let time = block_time(client, timestamps, block).await?;
            if let Some((id, key, sequence, status)) = proposal_id(pool, account.id, event.hash).await? {
                if status != "executed" {
                    sqlx::query("UPDATE olien_proposals SET status = 'executed', executed_tx = $2, executed_at = $3, updated_at = now() WHERE id = $1")
                        .bind(id)
                        .bind(&tx)
                        .bind(time as i64)
                        .execute(pool)
                        .await?;
                }
                sqlx::query("UPDATE olien_ledger SET proposal_id = $2 WHERE tx = $1 AND proposal_id IS NULL").bind(&tx).bind(id).execute(pool).await?;
                treasury::mark_replaced(pool, account.id, &key, sequence, id).await.map_err(|e| anyhow::anyhow!("{}", e.parts().1))?;
            } else if event.path != PATH_SINGLE {
                // A slot consumed by a transaction the service never saw still replaces
                // whatever the service holds at it, but only when the nonce is the
                // account's own (a user operation carries the EntryPoint's).
                let key = (event.nonce >> 64usize).to_string();
                let sequence = (event.nonce & U256::from(u64::MAX)).to::<u64>() as i64;
                treasury::mark_replaced(pool, account.id, &key, sequence, -1).await.map_err(|e| anyhow::anyhow!("{}", e.parts().1))?;
            }
            Ok(false)
        }
        t if t == IOlien::Scheduled::SIGNATURE_HASH => {
            let event = IOlien::Scheduled::decode_log(&log.inner)?;
            let ready_at = event.readyAt.to::<u64>() as i64;
            if let Some((id, key, sequence, status)) = proposal_id(pool, account.id, event.hash).await? {
                if status != "executed" && status != "vetoed" {
                    sqlx::query(
                        "UPDATE olien_proposals SET status = 'scheduled', executed_tx = COALESCE(executed_tx, $2), scheduled_ready_at = $3,
                            scheduled_window_ends = $4, scheduled_excluded = $5, path = $6, updated_at = now() WHERE id = $1",
                    )
                    .bind(id)
                    .bind(&tx)
                    .bind(ready_at)
                    .bind(ready_at + SCHEDULE_WINDOW as i64)
                    .bind(if event.excluded.is_zero() { None } else { Some(hex(event.excluded.as_slice())) })
                    .bind(if event.path == PATH_RECOVERY { "recovery" } else { "threshold" })
                    .execute(pool)
                    .await?;
                }
                treasury::mark_replaced(pool, account.id, &key, sequence, id).await.map_err(|e| anyhow::anyhow!("{}", e.parts().1))?;
            }
            Ok(false)
        }
        t if t == IOlien::ScheduledExecuted::SIGNATURE_HASH => {
            let event = IOlien::ScheduledExecuted::decode_log(&log.inner)?;
            let time = block_time(client, timestamps, block).await?;
            if let Some((id, _, _, _)) = proposal_id(pool, account.id, event.hash).await? {
                sqlx::query("UPDATE olien_proposals SET status = 'executed', executed_tx = $2, executed_at = $3, updated_at = now() WHERE id = $1")
                    .bind(id)
                    .bind(&tx)
                    .bind(time as i64)
                    .execute(pool)
                    .await?;
            }
            Ok(false)
        }
        t if t == IOlien::Approved::SIGNATURE_HASH => {
            let event = IOlien::Approved::decode_log(&log.inner)?;
            if let Some((id, _, _, _)) = proposal_id(pool, account.id, event.hash).await? {
                sqlx::query(
                    "INSERT INTO olien_confirmations (proposal_id, signer_id, signature, kind, onchain_tx) VALUES ($1, $2, ''::bytea, 'onchain', $3)
                     ON CONFLICT (proposal_id, signer_id) DO NOTHING",
                )
                .bind(id)
                .bind(hex(event.signerId.as_slice()))
                .bind(&tx)
                .execute(pool)
                .await?;
            }
            Ok(false)
        }
        t if t == IOlien::Vetoed::SIGNATURE_HASH => {
            let event = IOlien::Vetoed::decode_log(&log.inner)?;
            let time = block_time(client, timestamps, block).await?;
            if let Some((id, _, _, _)) = proposal_id(pool, account.id, event.hash).await? {
                sqlx::query("INSERT INTO olien_vetoes (proposal_id, signer_id, tx, block_time) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING")
                    .bind(id)
                    .bind(hex(event.signerId.as_slice()))
                    .bind(&tx)
                    .bind(time as i64)
                    .execute(pool)
                    .await?;
            }
            Ok(false)
        }
        t if t == IOlien::Cancelled::SIGNATURE_HASH => {
            let event = IOlien::Cancelled::decode_log(&log.inner)?;
            if let Some((id, _, _, status)) = proposal_id(pool, account.id, event.hash).await? {
                let next = if status == "scheduled" { "vetoed" } else { "cancelled" };
                sqlx::query("UPDATE olien_proposals SET status = $2, updated_at = now() WHERE id = $1 AND status <> 'executed'")
                    .bind(id)
                    .bind(next)
                    .execute(pool)
                    .await?;
            }
            Ok(false)
        }
        t if t == IOlien::EpochAdvanced::SIGNATURE_HASH => {
            let event = IOlien::EpochAdvanced::decode_log(&log.inner)?;
            sqlx::query("UPDATE olien_accounts SET epoch = $2 WHERE id = $1").bind(account.id).bind(event.epoch as i64).execute(pool).await?;
            // Every open proposal and every other scheduled change signed under the old
            // epoch verifies nothing now (spec §7.1).
            sqlx::query(
                "UPDATE olien_proposals SET status = 'stale', updated_at = now() WHERE olien_id = $1 AND epoch < $2
                 AND status IN ('open','ready','blocked','failed','scheduled')",
            )
            .bind(account.id)
            .bind(event.epoch as i64)
            .execute(pool)
            .await?;
            Ok(true)
        }
        t if t == IOlien::SignerAdded::SIGNATURE_HASH
            || t == IOlien::SignerRemoved::SIGNATURE_HASH
            || t == IOlien::ThresholdChanged::SIGNATURE_HASH
            || t == IOlien::VetoThresholdChanged::SIGNATURE_HASH
            || t == IOlien::DelaysChanged::SIGNATURE_HASH
            || t == IOlien::ImplementationChanged::SIGNATURE_HASH
            || t == IOlien::ImplementationFrozen::SIGNATURE_HASH
            || t == IOlien::Initialized::SIGNATURE_HASH =>
        {
            Ok(true)
        }
        t if t == IOlien::SpendingLimitSet::SIGNATURE_HASH => {
            let event = IOlien::SpendingLimitSet::decode_log(&log.inner)?;
            let id = event.id.to::<u64>();
            let (remaining, reset_at, generation, _) = client.limit_budget(address, id).await?;
            sqlx::query(
                "INSERT INTO olien_spending_limits (olien_id, limit_id, generation, token, from_address, amount, remaining, period, reset_at,
                    any_destination, signers, destinations, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '[]'::jsonb, '[]'::jsonb, 'active')
                 ON CONFLICT (olien_id, limit_id) DO UPDATE SET generation = EXCLUDED.generation, token = EXCLUDED.token,
                    from_address = EXCLUDED.from_address, amount = EXCLUDED.amount, remaining = EXCLUDED.remaining, period = EXCLUDED.period,
                    reset_at = EXCLUDED.reset_at, any_destination = EXCLUDED.any_destination, signers = '[]'::jsonb,
                    destinations = '[]'::jsonb, status = 'active'",
            )
            .bind(account.id)
            .bind(id as i64)
            .bind(generation as i64)
            .bind(addr(event.token))
            .bind(addr(event.from))
            .bind(event.amount.to_string())
            .bind(remaining.to_string())
            .bind(event.period.to::<u64>() as i64)
            .bind(reset_at as i64)
            .bind(event.anyDestination)
            .execute(pool)
            .await?;
            Ok(false)
        }
        t if t == IOlien::LimitSignerAllowed::SIGNATURE_HASH => {
            let event = IOlien::LimitSignerAllowed::decode_log(&log.inner)?;
            sqlx::query(
                "UPDATE olien_spending_limits SET signers = (SELECT jsonb_agg(DISTINCT v) FROM jsonb_array_elements(signers || to_jsonb(ARRAY[$3::text])) v)
                 WHERE olien_id = $1 AND limit_id = $2 AND generation = $4",
            )
            .bind(account.id)
            .bind(event.id.to::<u64>() as i64)
            .bind(hex(event.signerId.as_slice()))
            .bind(event.generation as i64)
            .execute(pool)
            .await?;
            Ok(false)
        }
        t if t == IOlien::LimitDestinationAllowed::SIGNATURE_HASH => {
            let event = IOlien::LimitDestinationAllowed::decode_log(&log.inner)?;
            sqlx::query(
                "UPDATE olien_spending_limits SET destinations = (SELECT jsonb_agg(DISTINCT v) FROM jsonb_array_elements(destinations || to_jsonb(ARRAY[$3::text])) v)
                 WHERE olien_id = $1 AND limit_id = $2 AND generation = $4",
            )
            .bind(account.id)
            .bind(event.id.to::<u64>() as i64)
            .bind(addr(event.to))
            .bind(event.generation as i64)
            .execute(pool)
            .await?;
            Ok(false)
        }
        t if t == IOlien::SpendingLimitRemoved::SIGNATURE_HASH => {
            let event = IOlien::SpendingLimitRemoved::decode_log(&log.inner)?;
            sqlx::query("UPDATE olien_spending_limits SET status = 'removed' WHERE olien_id = $1 AND limit_id = $2")
                .bind(account.id)
                .bind(event.id.to::<u64>() as i64)
                .execute(pool)
                .await?;
            Ok(false)
        }
        t if t == IOlien::Spent::SIGNATURE_HASH => {
            let event = IOlien::Spent::decode_log(&log.inner)?;
            let id = event.id.to::<u64>();
            if let Ok((remaining, reset_at, _, _)) = client.limit_budget(address, id).await {
                sqlx::query("UPDATE olien_spending_limits SET remaining = $3, reset_at = $4 WHERE olien_id = $1 AND limit_id = $2")
                    .bind(account.id)
                    .bind(id as i64)
                    .bind(remaining.to_string())
                    .bind(reset_at as i64)
                    .execute(pool)
                    .await?;
            }
            sqlx::query("UPDATE olien_ledger SET limit_id = $2 WHERE tx = $1 AND limit_id IS NULL").bind(&tx).bind(id as i64).execute(pool).await?;
            Ok(false)
        }
        t if t == IOlien::SubAccountCreated::SIGNATURE_HASH => {
            let event = IOlien::SubAccountCreated::decode_log(&log.inner)?;
            sqlx::query(
                "INSERT INTO olien_sub_accounts (olien_id, index, address, created_tx) VALUES ($1, $2, $3, $4) ON CONFLICT (olien_id, index) DO NOTHING",
            )
            .bind(account.id)
            .bind(event.index.to::<u64>() as i64)
            .bind(addr(event.subAccount))
            .bind(&tx)
            .execute(pool)
            .await?;
            Ok(false)
        }
        _ => Ok(false),
    }
}
