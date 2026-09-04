# Architecture

The product is a Concord account on Arc (`10-account-spec.md`, "spec" below), a
service that lets its signers see and sign the same pending transaction from
different devices, and clients that make the whole thing feel like a bank account
for a team. This document is the system design. The contract is the spec; the
reasons for it are in `05-onchain-design.md`; the procedures are in `06-algorithms.md`.

## The shape in one paragraph

Every team has a **Concord account** (its money and its rules), a set of **signers**
(each an EOA, a hardware wallet, a passkey, or a Recourse consumer account, which is
itself a Concord account), and a **queue** of proposed transactions moving through a
state machine until the threshold is met and one of them is executed. The
**transaction service** is the source of truth for the queue and the off-chain
signatures; the **indexer** is the source of truth for what the chain did; the
**relayer** submits executions. Policies that must hold even if every server is
compromised live inside the account: spending limits, delays on rule changes, veto,
expiry, the epoch. Policies that are about convenience and workflow live in the
service. The contract needs no service: any signer can act against it directly with
any client.

## Components

```
  iOS app (Recourse)        Web app (Treasury)         CLI / API keys
        |                         |                         |
        +-----------+-------------+-------------+-----------+
                    |                           |
             Transaction service          Read API (GraphQL/REST)
             (proposals, confirmations,   (balances, history, labels,
              scheduled changes, limits,   reports)
              policies, signers)
                    |                           |
          +---------+---------+        +--------+--------+
          |                   |        |                 |
       Relayer           Notifier   Indexer          Price/FX
     (execute, paid       (push,    (logs, receipts,  (StableFX quotes,
      by us; or handleOps, email,    Concord events,   USDC/EURC)
      repaid from the     Slack)     token transfers)
      account's deposit)               |
          |                            |
          +-------------+--------------+
                        |
                  Arc RPC (drpc) + Pimlico bundler + Arcscan
```

One Postgres. One Rust binary can host all of it at the start (the existing backend
already runs an indexer, an attestor relayer and the account routes); the boxes are
modules that can be split later, not services that must be separate now.

### Transaction service

Owns proposals and confirmations. Its API is ours, shaped by the spec's concepts.
The first draft mirrored Safe's transaction service; those routes are gone
(`05-onchain-design.md`). A proposal is identified by the `Transaction` typed hash
(spec §4). A confirmation is one packed entry `signerId ‖ len ‖ sig` (spec §5.1) for
one signer id, or the record of an on-chain `approve`.

Responsibilities:

- Register an account: predict its address with `ConcordFactory.getAddress(init,
  salt)` or deploy it, record its signers, threshold, delays and epoch, watch it.
- Accept a **proposal**: `nonceKey, calls[], validAfter, validUntil` plus a human
  intent (`kind`: transfer, payroll batch, rule change, signer change, contract
  call) and the decoded meaning the clients will show.
- Compute and store the `Transaction` hash for the account's domain, using the
  account's current `epoch` and the next sequence in the lane. Once per account the
  local hash of a fixed sample is compared with the contract's own answer.
- Accept **confirmations**: a 65-byte ECDSA signature, a 64-byte P-256 signature, a
  WebAuthn envelope, or a contract signature for a CONTRACT signer. A Recourse
  account signs `Message(hash)` in its own domain and the service stores the packed
  bytes it produced. An on-chain `approve` seen by the indexer is a confirmation
  too, stored with an empty signature.
- Track the queue per lane: which sequence is next in each `nonceKey`, what is
  blocked behind what, what conflicts.
- Track **scheduled changes**: a threshold execution that touches configuration, or
  a recovery, is stored by the account with `readyAt` and the one signer it
  removes (`excluded`); a configuration batch sent as a user operation is
  scheduled at execution the same way (spec §10). The service shows it, counts
  vetoes against the effective veto threshold, and offers `executeScheduled` when
  ready and before the 7-day window closes.
- Mirror **spending limits** (each with its `generation`, signers and
  destinations) and **sub-accounts** from the chain's events, never from its own
  writes.
- Hand an executable transaction to the relayer when the threshold is met and the
  policy layer says go; record the transaction hash; reconcile with the indexer.

### Indexer

Already exists for the escrow (`backend/src/jobs/indexer.rs`); grows to cover
Concord accounts. Reads logs and receipts through the RPC (Arc has no `trace_*` API
in the public RPC as far as tested, so this is the events-based indexer shape).
Sources:

- `AccountCreated(account, salt)` on the known factory, and `Initialized(threshold,
  vetoThreshold, configDelay, recoveryDelay, recoveryCoSignDelay)` filtered by
  topic alone, for accounts the service did not create itself; each hit is checked
  to be a `ConcordProxy` pointing at a known implementation before it is watched.
- The account's events, exactly spec §14: `SignerAdded`, `SignerRemoved`,
  `ThresholdChanged`, `VetoThresholdChanged`, `DelaysChanged`, `EpochAdvanced`,
  `Executed(hash, nonce, path)` (path 1 threshold, 2 recovery, 3 single; a user
  operation lands here too, with the EntryPoint's nonce), `Scheduled(hash,
  readyAt, path, excluded)`, `ScheduledExecuted`, `Approved`, `Vetoed`,
  `Cancelled`, `SpendingLimitSet(id, generation, token, from, amount, period,
  anyDestination)`, `LimitSignerAllowed`, `LimitDestinationAllowed`,
  `SpendingLimitRemoved`, `Spent`, `ImplementationChanged`,
  `ImplementationFrozen`, `SubAccountCreated`, plus OpenZeppelin's `Upgraded`
  from the proxy slot write. There are no module and no signed-message events:
  v1 has neither (spec §17).
- USDC and EURC `Transfer` where either side is a watched account or one of its
  sub-accounts.
- The EntryPoint v0.7 `UserOperationEvent` for operations the account sent.
- Arcscan's account API as a backfill for history before the watch started (the
  consumer app already reconstructs balance history this way,
  `Core/Domain/TransferHistory.swift`).

### Relayer

There is no refund in the contract. `execute` is callable by anyone and the caller
pays (spec §6.1); the account pays only through the EntryPoint (spec §10). Two ways
to submit, one on-chain result:

- **`execute`**: the relayer calls `Concord.execute(tx, signatures)` from its own key
  and pays the gas itself, in USDC. Spec §16 measures 88k gas in forge (median of
  the suite) for a one-transfer, two-ECDSA `execute`, which at the 25 gwei of
  `02-arc-facts.md` is about 0.002 USDC; Arc's own number is pending. The cost is
  part of the service's price. The relayer is a metered hot wallet with a balance
  alarm.
- **`EntryPoint.handleOps`**: the relayer submits the user operation to the
  EntryPoint from any EOA and the EntryPoint repays it from the account's deposit,
  which the account tops up from its own USDC during validation. No paymaster, no
  token approval, no bundler service: `handleOps` is a plain call. Pimlico's
  bundler is the same path through a public mempool, used by the consumer app
  today (`BundlerClient.swift`); it is a convenience, not a dependency, and an
  operation whose signer set includes a nested account goes through our own
  `handleOps` call rather than the public mempool (spec §9). This is also the only
  way a P-256 or passkey signer can `spend`, `veto` or `approve`: each is one self
  call inside an operation validated for that one signer (spec §10, §11).

Both paths produce the same state and the indexer treats them the same. The relayer
is the existing attestor-key infrastructure (`services/attestor.rs`) with a separate
key.

### Policy layer

Two tiers, on purpose:

| Tier | Where | Examples | Holds when |
| --- | --- | --- | --- |
| Hard | Inside the account (spec §7, §8) | spending limits with one signature and a destination list, `configDelay` on rule changes, veto, `validUntil` expiry, epoch staleness, recovery delays | every server is gone or hostile |
| Soft | Service | approval routing by amount, who is asked first, working hours, notes required, Slack approvals, scheduled proposals | the service is honest |

No guard, no hook and no module ships in version 1 (spec §17). Every policy the
first draft put in a module or a guard is now a rule of the account. The service never claims a soft
rule is a hard one. The UI labels them.

### Clients

- **Web app** (Next.js in `web/`): the treasury console. Members sign with a
  browser wallet, a hardware wallet through it, or a passkey registered as a
  WEBAUTHN signer.
- **iOS app** (`mobile/`): a Recourse account can be a signer. Its confirmation is
  a nested signature: the app signs `Message(outerHash)` in its own account's domain
  with device key and cloud key, and the packed result is the CONTRACT entry (spec
  §9). A `ConcordSigner` beside `SafeAccountSigner` produces it
  (`05-onchain-design.md`). The app shows the team queue and lets the member
  approve with Face ID, and shows `Scheduled` changes with a veto button; a veto
  applies to a scheduled change only, and the app's keys cast it through a user
  operation (spec §8.3, §11).
- **API keys** for finance tooling: read-only history and exports; proposal creation
  for payroll systems, never signing.

## Data model

Postgres, additive to the existing schema. Addresses stored lowercased hex; amounts
as text or numeric(78,0); hashes and signer ids as bytea.

```sql
accounts (
  id, account_address UNIQUE, chain_id, name, created_by_account_id,
  implementation, implementation_frozen, epoch,
  threshold, veto_threshold,                 -- veto_threshold 0 = automatic (spec §7.4)
  config_delay, recovery_delay, recovery_cosign_delay,
  init JSONB, salt, status,                  -- predicted | deployed | live | retired
  created_at, updated_at
)
signers (
  account_id, signer_id bytea, kind,         -- ecdsa | p256 | webauthn | contract
  permissions smallint, flags smallint,      -- bits: APPROVE=1, VETO=2, RECOVER=4; UV_REQUIRED=1
  address NULL, x NULL, y NULL,              -- key material as the chain stores it
  label, member_account_id NULL,             -- a Recourse account when kind = contract
  added_tx bytea, removed_tx bytea, status,
  UNIQUE (account_id, signer_id)
)
proposals (
  id, account_id, tx_hash bytea UNIQUE,
  nonce_key, nonce, epoch,                   -- nonce = (key << 64) | sequence, as hashed
  calls JSONB,                               -- [{ to, value, data }]
  valid_after, valid_until,
  kind, intent JSONB,                        -- decoded meaning: recipients, amounts, memo, invoice ids
  proposer_signer_id, origin,
  path,                                      -- threshold | recovery
  status,                                    -- draft | open | ready | executing | executed | scheduled | vetoed | cancelled | failed | replaced | expired | stale
  scheduled_ready_at NULL, scheduled_window_ends NULL,
  scheduled_excluded bytea NULL,             -- the signer the change removes, who cannot veto it (spec §8.1)
  replaces_proposal_id NULL,
  executed_tx bytea, executed_at, created_at
)
confirmations (
  proposal_id, signer_id bytea, signature bytea,
  kind,                                      -- offchain | onchain (an approve seen in the logs; signature empty)
  signed_at, onchain_tx bytea NULL,
  UNIQUE (proposal_id, signer_id)
)
vetoes (proposal_id, signer_id bytea, tx bytea, block_time)
spending_limits (
  account_id, limit_id, generation, epoch,   -- generation bumps on every (re)set; the signer and destination sets belong to it (spec §7.6)
  token, from_address, amount, remaining, period, reset_at,
  any_destination, signers JSONB, destinations JSONB, status, set_by_proposal_id,
  UNIQUE (account_id, limit_id)
)
sub_accounts (account_id, index, address UNIQUE, label, created_tx bytea)
policies (
  id, account_id, tier,                      -- hard (mirrors the chain) | soft
  kind,                                      -- spending_limit | delay | approval_tier | known_destination | schedule
  params JSONB, onchain_ref, status, created_by_proposal_id
)
ledger_entries (
  id, account_id, tx_hash, log_index, token, counterparty, direction, amount,
  block_number, block_time, proposal_id NULL, limit_id NULL, sub_account NULL,
  label, category, invoice_id NULL
)
address_book (account_id, address, label, category, verified_by, created_at)
payroll_runs (id, account_id, schedule JSONB, next_run_at, proposal_template JSONB, status)
```

`proposals.tx_hash` is the identity of a transaction across devices; `(nonce_key,
nonce)` is the identity of its slot in the queue. Two proposals can share a slot
(they compete); at most one executes and the other becomes `replaced`. A proposal
whose `epoch` is behind the account's is `stale` and its signatures verify nothing
on-chain (spec §7.1).

## APIs

REST under `/api/accounts`, bearer sessions as today, plus API keys scoped to an
account with `read` or `propose` rights. Shapes shown as the minimum a client needs.

```
POST   /accounts                          { name, signers[], threshold, vetoThreshold?, delays? }
                                                                            -> { account, status, predictedAddress, init, salt }
GET    /accounts/{address}                                                  -> signers, threshold, epoch, delays, limits, subAccounts, balances, deposit
GET    /accounts/{address}/proposals?status=open&nonceKey=                  -> [{ txHash, nonceKey, nonce, epoch, kind, intent, path,
                                                                                  confirmations[], required, missing[], validUntil }]
POST   /accounts/{address}/proposals      { calls[], nonceKey?, validAfter?, validUntil?, kind, intent }
                                                                            -> { txHash, nonceKey, nonce, epoch, typedData }
POST   /accounts/{address}/proposals/{txHash}/confirmations  { signerId, signature }
                                                                            -> stored after the per-kind check (06 §4); empty signature = on-chain approve
POST   /accounts/{address}/proposals/{txHash}/execute        { via: execute | userop }   -> { txHash }
POST   /accounts/{address}/proposals/{txHash}/cancel                        -> a proposal carrying cancel(txHash): immediate under the threshold, no delay, no epoch change
GET    /accounts/{address}/scheduled                                        -> [{ hash, readyAt, windowEndsAt, path, excluded, calls, vetoes[], effectiveVetoThreshold }]
POST   /accounts/{address}/scheduled/{hash}/veto              { signerId }  -> veto(hash) calldata for an ECDSA or CONTRACT signer's own address, or, for a P256 or
                                                                               WEBAUTHN signer, a user operation (one self call, validated for that signer) the client signs
                                                                               and the relayer submits
POST   /accounts/{address}/scheduled/{hash}/execute                        -> executeScheduled by the relayer
GET    /accounts/{address}/limits          /  POST ...                       -> a proposal carrying setSpendingLimit, allowLimitSigner and allowLimitDestination (delayed)
DELETE /accounts/{address}/limits/{id}                                      -> a proposal carrying removeSpendingLimit (immediate)
POST   /accounts/{address}/limits/{id}/spend  { to, amount, signerId }      -> spend(id, to, amount) calldata for the signer's own address, or a user operation, as for veto
GET    /accounts/{address}/sub-accounts    /  POST { index }                 -> createSubAccount, by anyone
GET    /accounts/{address}/ledger?from&to&token&cursor                      -> entries
GET    /accounts/{address}/policies        /  POST ...                       -> hard policies produce a proposal; soft ones apply immediately
POST   /accounts/{address}/payroll/runs   { schedule, recipients[] }        -> creates proposals on schedule
```

`typedData` in the proposal response is the EIP-712 `Transaction` payload in the
account's domain (`name = "Concord"`, `version = "1"`, spec §4) so a wallet can sign
with `eth_signTypedData_v4`, and the service can check the signer before storing
anything. For P256 and WEBAUTHN signers the client signs the same digest with the
key and the service checks it as that kind.

## How a signature travels

1. A member proposes from any client. The service picks the lane (`nonceKey`) and
   the next sequence in it, reads the account's `epoch`, computes the `Transaction`
   hash, stores the proposal `open`, notifies the other signers.
2. Each signer opens it, sees the decoded calls and an independent simulation
   result, and signs the typed data. The client posts `{ signerId, signature }`. The
   service checks it as the signer's kind (`06-algorithms.md` §4) and rejects
   anything that does not check out. A signer that cannot sign off-chain calls
   `approve(hash)` on the account instead: from its own address if it is ECDSA or
   CONTRACT (a nested Concord does so with a one-call threshold transaction), or
   through a user operation validated for it if it is P256 or WEBAUTHN (spec §11);
   the indexer turns the `Approved` event into a confirmation with an empty
   signature.
3. When distinct APPROVE confirmations reach `threshold`, the simulation passes, no
   soft policy blocks it, and the sequence is next in its lane, the proposal is
   `ready`. The proposer, any member, or a schedule triggers execution.
4. The relayer packs the entries sorted by `signerId` ascending, each as
   `signerId ‖ len ‖ sig` (`len = 0` for an on-chain approval), calls `execute` or
   submits a user operation, and records the transaction hash. The indexer confirms
   `Executed(hash, nonce, path)` or `Scheduled(hash, readyAt, path, excluded)` for
   that `txHash`.
   If the chain shows a different transaction consumed the slot, the proposal
   becomes `replaced` and members are told why. If `EpochAdvanced` fires first, it
   becomes `stale`.
5. A scheduled change waits for `readyAt`. The service shows the countdown, the
   veto count and the effective veto threshold. When ready, anyone (the relayer by
   default) calls `executeScheduled(hash, calls)` within 7 days, and the indexer
   confirms `ScheduledExecuted(hash)`. If enough vetoes arrive first, the indexer
   sees `Cancelled(hash)` and the proposal is `vetoed`. The signer a threshold
   change removes (`excluded` in the `Scheduled` event) cannot veto it; the signer
   a guardian replaces can (spec §8.3).
6. A veto exists for scheduled changes only. A pending proposal whose approvals
   the team no longer wants honoured is killed by a one-call threshold proposal
   `cancel(txHash)`, which runs at once with no delay and no epoch change, or it
   dies at its `validUntil`, which the contract requires and caps at 30 days
   (spec §6.1, §8.4). The indexer sees `Cancelled(hash)` and the proposal is
   `cancelled`.

A Recourse account as signer differs only in step 2: the app computes
`Message(txHash)` in its own account's domain (`06-algorithms.md` §2), signs it with
device and cloud keys, packs the two entries, and posts that as its signature. The
service verifies it by calling `isValidSignature(txHash, packed)` on the member's
account; the chain does the same at execution (spec §9).

## What runs where, at the start

One Railway service (the existing backend) gains the account routes, the Concord
indexer and the relayer loop. The web app gains a `/treasury` section. The iOS app
gains a team queue and a veto screen. No new infrastructure until the queue is busy
enough to need it. The contracts live in `contracts/src/concord/` beside the
Safe-era `P256Owner`, and deploy through the same CREATE2 proxy at the same
addresses on every chain (spec §18); the five of them have been on Arc testnet
since 2026-09-04 (`02-arc-facts.md`, proofs table).
