// Payroll runs (docs/treasury/06-algorithms.md §10, 11-service-api.md "Payroll runs").
//
// A run is a template: a name, a token, a list of people and amounts, and maybe a
// schedule. Running it opens a batch proposal in the payroll lane through the same
// path a hand-typed payment takes, so nothing here can move money on its own: the
// members still sign. What the template saves is the retyping, and with a schedule
// the remembering, since the service opens the proposal on the day and the members
// find it in the queue.

use chrono::{DateTime, Duration, Months, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use tracing::{info, warn};

use crate::treasury::{self, bad, context_for, parse_address, ProposalView, RecipientBody, Res, Treasury, TreasuryError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Period {
    None,
    Weekly,
    Fortnightly,
    Monthly,
}

impl Period {
    fn parse(value: &str) -> Res<Period> {
        match value.trim() {
            "none" | "" => Ok(Period::None),
            "weekly" => Ok(Period::Weekly),
            "fortnightly" => Ok(Period::Fortnightly),
            "monthly" => Ok(Period::Monthly),
            other => Err(bad(format!("period must be none, weekly, fortnightly or monthly, not {other}"))),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Period::None => "none",
            Period::Weekly => "weekly",
            Period::Fortnightly => "fortnightly",
            Period::Monthly => "monthly",
        }
    }

    /// The run after `from`. Monthly keeps the day of the month where the calendar
    /// allows and clamps where it does not (the 31st runs on the 30th in June).
    pub fn next_after(self, from: DateTime<Utc>) -> Option<DateTime<Utc>> {
        match self {
            Period::None => None,
            Period::Weekly => Some(from + Duration::days(7)),
            Period::Fortnightly => Some(from + Duration::days(14)),
            Period::Monthly => from.checked_add_months(Months::new(1)),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PayrollBody {
    pub name: String,
    pub token: Option<String>,
    pub recipients: Vec<RecipientBody>,
    #[serde(default)]
    pub period: Option<String>,
    /// Unix seconds. Required when period is not none; the first scheduled run.
    pub next_run_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PayrollView {
    pub id: i64,
    pub name: String,
    pub token: String,
    pub recipients: Vec<RecipientBody>,
    pub total: String,
    pub period: Period,
    pub next_run_at: Option<i64>,
    pub last_run_at: Option<i64>,
    pub last_run_tx_hash: Option<String>,
    pub last_error: Option<String>,
    pub created_at: i64,
}

#[derive(sqlx::FromRow)]
struct Row {
    id: i64,
    name: String,
    token: String,
    recipients: Value,
    period: String,
    next_run_at: Option<DateTime<Utc>>,
    last_run_at: Option<DateTime<Utc>>,
    last_run_tx_hash: Option<String>,
    last_error: Option<String>,
    created_at: DateTime<Utc>,
}

const SELECT: &str = "SELECT r.id, r.name, r.token, r.recipients, r.period, r.next_run_at, r.last_run_at, p.tx_hash AS last_run_tx_hash, r.last_error, r.created_at
    FROM olien_payrolls r LEFT JOIN olien_proposals p ON p.id = r.last_run_proposal_id";

fn view_of(row: Row) -> Res<PayrollView> {
    let recipients: Vec<RecipientBody> = serde_json::from_value(row.recipients).map_err(|e| TreasuryError::Internal(anyhow::anyhow!("payroll recipients: {e}")))?;
    let total = recipients.iter().try_fold(alloy::primitives::U256::ZERO, |sum, r| {
        alloy::primitives::U256::from_str_radix(r.amount.trim(), 10).map(|a| sum + a).map_err(|_| bad(format!("{} is not an amount", r.amount)))
    })?;
    Ok(PayrollView {
        id: row.id,
        name: row.name,
        token: row.token,
        recipients,
        total: total.to_string(),
        period: Period::parse(&row.period)?,
        next_run_at: row.next_run_at.map(|t| t.timestamp()),
        last_run_at: row.last_run_at.map(|t| t.timestamp()),
        last_run_tx_hash: row.last_run_tx_hash,
        last_error: row.last_error,
        created_at: row.created_at.timestamp(),
    })
}

/// Everything a template must get right before it is saved, checked the way a run
/// would check it, so a bad address fails on save and not on payday.
fn checked(treasury: &Treasury, body: &PayrollBody) -> Res<(String, String, Value, Period, Option<DateTime<Utc>>)> {
    let client = treasury.client.as_ref().ok_or(TreasuryError::Off)?;
    let name = body.name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(bad("a payroll run needs a name of up to 80 characters"));
    }
    let (_, _, _, token) = treasury::transfer_batch(client, &body.recipients, body.token.as_deref())?;
    let recipients: Vec<RecipientBody> = body
        .recipients
        .iter()
        .map(|r| {
            Ok(RecipientBody {
                to: format!("{:#x}", parse_address(&r.to)?),
                amount: r.amount.trim().to_string(),
                label: r.label.as_deref().map(str::trim).filter(|l| !l.is_empty()).map(String::from),
                memo: r.memo.as_deref().map(str::trim).filter(|m| !m.is_empty()).map(String::from),
            })
        })
        .collect::<Res<_>>()?;
    let period = Period::parse(body.period.as_deref().unwrap_or("none"))?;
    let next = match period {
        Period::None => None,
        _ => {
            let at = body.next_run_at.ok_or_else(|| bad("a scheduled run needs its first date"))?;
            let at = DateTime::<Utc>::from_timestamp(at, 0).ok_or_else(|| bad("nextRunAt is not a time"))?;
            if at < Utc::now() - Duration::hours(1) {
                return Err(bad("the first run is in the past"));
            }
            Some(at)
        }
    };
    Ok((name.to_string(), format!("{token:#x}"), serde_json::to_value(recipients).unwrap_or(Value::Null), period, next))
}

pub async fn list(pool: &PgPool, user: i64, address: &str) -> Res<Vec<PayrollView>> {
    let ctx = context_for(pool, user, address).await?;
    let rows: Vec<Row> = sqlx::query_as(&format!("{SELECT} WHERE r.olien_id = $1 ORDER BY r.created_at")).bind(ctx.row.id).fetch_all(pool).await?;
    rows.into_iter().map(view_of).collect()
}

pub async fn create(pool: &PgPool, treasury: &Treasury, user: i64, address: &str, body: PayrollBody) -> Res<PayrollView> {
    let ctx = context_for(pool, user, address).await?;
    let (name, token, recipients, period, next) = checked(treasury, &body)?;
    let (id,): (i64,) = sqlx::query_as(
        "INSERT INTO olien_payrolls (olien_id, name, token, recipients, period, next_run_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    )
    .bind(ctx.row.id)
    .bind(&name)
    .bind(&token)
    .bind(&recipients)
    .bind(period.as_str())
    .bind(next)
    .bind(user)
    .fetch_one(pool)
    .await?;
    get(pool, ctx.row.id, id).await
}

pub async fn update(pool: &PgPool, treasury: &Treasury, user: i64, address: &str, id: i64, body: PayrollBody) -> Res<PayrollView> {
    let ctx = context_for(pool, user, address).await?;
    let (name, token, recipients, period, next) = checked(treasury, &body)?;
    // Whoever edits a scheduled run becomes the member it runs as, since the old
    // creator may no longer be one; a run should always be attributable to someone
    // who is a member today.
    let done = sqlx::query(
        "UPDATE olien_payrolls SET name = $3, token = $4, recipients = $5, period = $6, next_run_at = $7, last_error = NULL, created_by = $8, updated_at = now()
         WHERE id = $1 AND olien_id = $2",
    )
    .bind(id)
    .bind(ctx.row.id)
    .bind(&name)
    .bind(&token)
    .bind(&recipients)
    .bind(period.as_str())
    .bind(next)
    .bind(user)
    .execute(pool)
    .await?;
    if done.rows_affected() == 0 {
        return Err(TreasuryError::NotFound("no such payroll run".into()));
    }
    get(pool, ctx.row.id, id).await
}

pub async fn delete(pool: &PgPool, user: i64, address: &str, id: i64) -> Res<()> {
    let ctx = context_for(pool, user, address).await?;
    let done = sqlx::query("DELETE FROM olien_payrolls WHERE id = $1 AND olien_id = $2").bind(id).bind(ctx.row.id).execute(pool).await?;
    if done.rows_affected() == 0 {
        return Err(TreasuryError::NotFound("no such payroll run".into()));
    }
    Ok(())
}

async fn get(pool: &PgPool, olien_id: i64, id: i64) -> Res<PayrollView> {
    let row: Option<Row> = sqlx::query_as(&format!("{SELECT} WHERE r.id = $1 AND r.olien_id = $2")).bind(id).bind(olien_id).fetch_optional(pool).await?;
    view_of(row.ok_or_else(|| TreasuryError::NotFound("no such payroll run".into()))?)
}

/// Open the run's proposal now, as the caller. The schedule, if any, is untouched:
/// running early by hand does not move payday.
pub async fn run(pool: &PgPool, treasury: &Treasury, user: i64, address: &str, id: i64, via_key: Option<i64>) -> Res<ProposalView> {
    let ctx = context_for(pool, user, address).await?;
    let template = get(pool, ctx.row.id, id).await?;
    let view = treasury::propose_payroll(pool, treasury, user, address, template.id, &template.name, &template.recipients, Some(&template.token), via_key).await?;
    record_run(pool, id, &view.tx_hash).await?;
    Ok(view)
}

async fn record_run(pool: &PgPool, id: i64, tx_hash: &str) -> Res<()> {
    sqlx::query(
        "UPDATE olien_payrolls SET last_run_at = now(), last_error = NULL, updated_at = now(),
            last_run_proposal_id = (SELECT id FROM olien_proposals WHERE tx_hash = $2)
         WHERE id = $1",
    )
    .bind(id)
    .bind(tx_hash)
    .execute(pool)
    .await?;
    Ok(())
}

/// Every scheduled run whose day has come. Called from the indexer's cycle. Each is
/// claimed by moving its date forward first, so two cycles cannot open it twice; if
/// opening then fails the reason is written on the template rather than lost, and
/// the run is not retried until its next date.
pub async fn run_due(pool: &PgPool, treasury: &Treasury) -> anyhow::Result<()> {
    #[derive(sqlx::FromRow)]
    struct Due {
        id: i64,
        address: String,
        period: String,
        next_run_at: DateTime<Utc>,
        created_by: Option<i64>,
    }
    let due: Vec<Due> = sqlx::query_as(
        "SELECT r.id, a.address, r.period, r.next_run_at, r.created_by FROM olien_payrolls r JOIN olien_accounts a ON a.id = r.olien_id
         WHERE r.period <> 'none' AND r.next_run_at IS NOT NULL AND r.next_run_at <= now() AND a.status = 'live'",
    )
    .fetch_all(pool)
    .await?;
    for item in due {
        let period = Period::parse(&item.period).map_err(|e| anyhow::anyhow!("{}", e.parts().1))?;
        // Skip past any dates already missed (the service was down): one run, not a pile.
        let mut next = item.next_run_at;
        while let Some(later) = period.next_after(next) {
            next = later;
            if next > Utc::now() {
                break;
            }
        }
        let claimed = sqlx::query("UPDATE olien_payrolls SET next_run_at = $3, updated_at = now() WHERE id = $1 AND next_run_at = $2")
            .bind(item.id)
            .bind(item.next_run_at)
            .bind(next)
            .execute(pool)
            .await?;
        if claimed.rows_affected() == 0 {
            continue;
        }
        let outcome = match item.created_by {
            Some(user) => run(pool, treasury, user, &item.address, item.id, None).await.map(|view| view.tx_hash),
            None => Err(bad("the member who scheduled this run no longer has an account")),
        };
        match outcome {
            Ok(hash) => info!("payroll run {} opened {hash} on {}", item.id, item.address),
            Err(e) => {
                let (_, message) = e.parts();
                warn!("payroll run {} on {} did not open: {message}", item.id, item.address);
                sqlx::query("UPDATE olien_payrolls SET last_error = $2, updated_at = now() WHERE id = $1")
                    .bind(item.id)
                    .bind(format!("The run due {} did not open: {message}", item.next_run_at.format("%Y-%m-%d")))
                    .execute(pool)
                    .await?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn a_monthly_run_keeps_its_day_and_clamps_short_months() {
        let jan31 = Utc.with_ymd_and_hms(2026, 1, 31, 9, 0, 0).unwrap();
        let feb = Period::Monthly.next_after(jan31).unwrap();
        assert_eq!(feb, Utc.with_ymd_and_hms(2026, 2, 28, 9, 0, 0).unwrap());
        let mar25 = Utc.with_ymd_and_hms(2026, 3, 25, 9, 0, 0).unwrap();
        assert_eq!(Period::Monthly.next_after(mar25).unwrap(), Utc.with_ymd_and_hms(2026, 4, 25, 9, 0, 0).unwrap());
    }

    #[test]
    fn weekly_and_fortnightly_are_plain_days_and_none_never_runs() {
        let start = Utc.with_ymd_and_hms(2026, 9, 9, 9, 0, 0).unwrap();
        assert_eq!(Period::Weekly.next_after(start).unwrap(), start + Duration::days(7));
        assert_eq!(Period::Fortnightly.next_after(start).unwrap(), start + Duration::days(14));
        assert!(Period::None.next_after(start).is_none());
    }

    #[test]
    fn period_words_are_the_four_the_console_offers() {
        assert_eq!(Period::parse("monthly").unwrap(), Period::Monthly);
        assert_eq!(Period::parse("").unwrap(), Period::None);
        assert!(Period::parse("daily").is_err());
    }
}
