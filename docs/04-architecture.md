# Architecture

The product is a Safe on Arc, a service that lets its owners see and sign the same
pending transaction from different devices, and clients that make the whole thing
feel like a bank account for a team. This document is the system design. The
on-chain pieces are in `05-onchain-design.md`; the procedures are in `06-algorithms.md`.

## The shape in one paragraph

Every team has a **Safe** (its money and its rules), a set of **members** (owners,
each of which is an EOA, a hardware wallet, a passkey signer or a Recourse consumer
account, which is itself a Safe), and a **queue** of proposed transactions moving
through a state machine until the threshold is met and one of them is executed. The
**transaction service** is the source of truth for the queue and the signatures; the
**indexer** is the source of truth for what the chain did; the **relayer** submits
executions and is repaid by the Safe in USDC. Policies that must hold even if every
server is compromised live in Safe modules and guards; policies that are about
convenience and workflow live in the service.

## Components

```
  iOS app (Recourse)        Web app (Treasury)         CLI / API keys
        |                         |                         |
        +-----------+-------------+-------------+-----------+
                    |                           |
             Transaction service          Read API (GraphQL/REST)
             (proposals, signatures,      (balances, history, labels,
              policies, members)           reports)
                    |                           |
          +---------+---------+        +--------+--------+
          |                   |        |                 |
       Relayer           Notifier   Indexer          Price/FX
     (execTransaction     (push,    (logs, receipts,  (StableFX quotes,
      or 4337, repaid     email,     Safe events,      USDC/EURC)
      in USDC)            Slack)     token transfers)
          |                            |
          +-------------+--------------+
                        |
                  Arc RPC (drpc) + Pimlico bundler + Arcscan
```

One Postgres. One Rust binary can host all of it at the start (the existing backend
already runs an indexer, an attestor relayer and the account routes); the boxes are
modules that can be split later, not services that must be separate now.

### Transaction service

Owns proposals and confirmations. It is not Safe's transaction service, but its API
follows Safe's shapes where they matter (`safeTxHash`, `confirmations[]`,
`nonce`, `origin`) so Safe{Core} SDK clients and Safe{Wallet} could point at it later
(see `08-roadmap-and-grants.md`).

Responsibilities:

- Register a Safe: predict or deploy it, record its owners and threshold, watch it.
- Accept a **proposal**: `to, value, data, operation, nonce` plus a human intent
  (`kind`: transfer, payroll batch, policy change, member change, contract call) and
  the decoded meaning the clients will show.
- Compute and store `safeTxHash` for the Safe's domain (verified against the chain
  once per Safe: `getTransactionHash` of a fixed sample).
- Accept **confirmations**: 65-byte owner signatures, or contract signatures for
  owners that are contracts (a Recourse account signs as a Safe; the service stores
  the packed bytes it produced).
- Track the queue: which nonce is next, what is blocked behind what, what conflicts.
- Hand an executable transaction to the relayer when the threshold is met and the
  policy layer says go; record the transaction hash; reconcile with the indexer.

### Indexer

Already exists for the escrow (`backend/src/jobs/indexer.rs`); grows to cover Safes.
Reads logs and receipts through the RPC (Arc has no `trace_*` API in the public RPC
as far as tested, so this is the events-based indexer shape, which is what Safe runs
on every L2). Sources:

- `SafeProxyFactory.ProxyCreation` for Safes it did not create itself.
- Safe events: `ExecutionSuccess(bytes32 txHash, uint256 payment)`,
  `ExecutionFailure`, `AddedOwner`, `RemovedOwner`, `ChangedThreshold`,
  `EnabledModule`, `DisabledModule`, `ChangedGuard`, `SafeReceived`,
  `ExecutionFromModuleSuccess`.
- USDC and EURC `Transfer` where either side is a watched Safe.
- The 4337 EntryPoint `UserOperationEvent` for operations the Safe sent through the
  module.
- Arcscan's account API as a backfill for history before the watch started (the
  consumer app already reconstructs balance history this way,
  `Core/Domain/TransferHistory.swift`).

### Relayer

Submits `execTransaction` and is repaid by the Safe: `gasToken = address(0)`,
`gasPrice = tx.gasprice` upper bound, `refundReceiver = relayer`. On Arc the refund
is USDC because the native token is USDC, so the Safe pays its own way with no
paymaster and no token approval. Alternatively the client sends a 4337 user
operation through Pimlico, as the consumer app does today; both paths produce the
same on-chain state and the indexer treats them the same. The relayer is the existing
attestor-key infrastructure (`services/attestor.rs`, `services/safe.rs`), with a
separate key and a hot-wallet balance alarm.

### Policy layer

Two tiers, on purpose:

| Tier | Where | Examples | Holds when |
| --- | --- | --- | --- |
| Hard | On-chain: modules and a guard | spending limits with a single signature, time lock on member changes, destination allowlist for automated payouts | every server is gone or hostile |
| Soft | Service | approval routing by amount, who is asked first, working hours, notes required, Slack approvals, scheduled proposals | the service is honest |

The service never claims a soft rule is a hard one. The UI labels them.

### Clients

- **Web app** (Next.js in `web/`): the treasury console. Members sign with a
  browser wallet, a hardware wallet through it, or a passkey signer.
- **iOS app** (`mobile/`): a Recourse account can be a member. Its signature is a
  nested Safe signature (proven on Arc, see `02-arc-facts.md`), produced by the same
  `SafeAccountSigner` the consumer flows use. The app shows the team queue and lets
  the member approve with Face ID.
- **API keys** for finance tooling: read-only history and exports; proposal creation
  for payroll systems, never signing.

## Data model

Postgres, additive to the existing schema. Addresses stored lowercased hex; amounts
as text or numeric(78,0); hashes as bytea.

```sql
treasuries (
  id, safe_address UNIQUE, chain_id, name, created_by_account_id,
  threshold, salt_nonce, status,            -- predicted | deployed | live | retired
  guard_address, delay_module, allowance_module,
  created_at, updated_at
)
treasury_members (
  treasury_id, owner_address, kind,          -- eoa | hardware | passkey | recourse_account | safe
  label, account_id NULL, added_tx bytea, removed_tx bytea, status
)
proposals (
  id, treasury_id, safe_tx_hash UNIQUE, nonce,
  "to", value, data, operation, safe_tx_gas, base_gas, gas_price, gas_token, refund_receiver,
  kind, intent JSONB,                        -- decoded meaning: recipients, amounts, memo, invoice ids
  proposer_address, origin,
  status,                                    -- draft | open | ready | executing | executed | failed | cancelled | replaced | stale
  replaces_proposal_id NULL, execute_after NULL, expires_at,   -- a proposal nobody executed lapses; see 06 §5
  owners_snapshot JSONB,                     -- owners and threshold when proposed; a change makes it stale
  executed_tx bytea, executed_at, created_at
)
confirmations (
  proposal_id, owner_address, signature bytea, signature_type, -- eoa | eth_sign | contract | approved_hash
  signed_at, expires_at,                     -- the service will not relay a signature older than the policy allows
  UNIQUE (proposal_id, owner_address)
)
policies (
  id, treasury_id, tier,                     -- hard | soft
  kind,                                      -- spending_limit | delay | allowlist | approval_tier | schedule
  params JSONB, onchain_ref, status, created_by_proposal_id
)
ledger_entries (
  id, treasury_id, tx_hash, log_index, token, counterparty, direction, amount,
  block_number, block_time, proposal_id NULL, label, category, invoice_id NULL
)
address_book (treasury_id, address, label, category, verified_by, created_at)
payroll_runs (id, treasury_id, schedule JSONB, next_run_at, proposal_template JSONB, status)
```

`proposals.safe_tx_hash` is the identity of a transaction across devices; the nonce
is the identity of its slot in the queue. Two proposals can share a nonce (they
compete); at most one executes and the other becomes `replaced`.

## APIs

REST under `/api/treasuries`, bearer sessions as today, plus API keys scoped to a
treasury with `read` or `propose` rights. Shapes shown as the minimum a client needs.

```
POST   /treasuries                       { name, owners[], threshold }            -> { safe, status, predictedAddress }
GET    /treasuries/{safe}                                                          -> info, members, threshold, modules, balances
GET    /treasuries/{safe}/proposals?status=open                                     -> [{ safeTxHash, nonce, kind, intent, confirmations[], required, missing[] }]
POST   /treasuries/{safe}/proposals      { to, value, data, operation, kind, intent, nonce? }
                                                                                    -> { safeTxHash, nonce, typedData }
POST   /treasuries/{safe}/proposals/{hash}/confirmations  { owner, signature, signatureType }
POST   /treasuries/{safe}/proposals/{hash}/execute        { via: relay | userop }   -> { txHash }
POST   /treasuries/{safe}/proposals/{hash}/cancel                                   -> a competing proposal at the same nonce, or a no-op tx
GET    /treasuries/{safe}/ledger?from&to&token&cursor                               -> entries
GET    /treasuries/{safe}/policies      /  POST ...                                  -> hard policies produce a proposal; soft ones apply immediately
POST   /treasuries/{safe}/payroll/runs  { schedule, recipients[] }                  -> creates proposals on schedule
```

`typedData` in the proposal response is the EIP-712 `SafeTx` payload so a wallet can
sign with `eth_signTypedData_v4` and the service can verify the recovered owner
before storing anything.

## How a signature travels

1. A member proposes from any client. The service assigns the nonce, computes
   `safeTxHash`, stores the proposal `open`, notifies the other members.
2. Each member opens it, sees the decoded intent and an independent simulation
   result, signs the typed data. The client posts the signature. The service recovers
   the signer (or, for a contract owner, calls that owner's `isValidSignature`
   through the RPC) and rejects anything that does not check out.
3. When `confirmations >= threshold` and no hard policy blocks it and the nonce is
   next, the proposal is `ready`. The proposer, any member, or a schedule triggers
   execution.
4. The relayer packs signatures in ascending owner order, calls `execTransaction`,
   records the hash, and the indexer confirms `ExecutionSuccess` for that
   `safeTxHash`. If the chain shows a different transaction consumed the nonce, the
   proposal becomes `replaced` and members are told why.

A Recourse account as member differs only in step 2: the app signs the Safe message
hash of the outer transaction bytes with both its keys and posts the packed result as
a contract signature.

## What runs where, at the start

One Railway service (the existing backend) gains the treasury routes, the Safe
indexer and the relayer loop. The web app gains a `/treasury` section. The iOS app
gains a team queue. No new infrastructure until the queue is busy enough to need it.
