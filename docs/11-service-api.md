# Transaction service API

The routes the console and the iOS app talk to for Olien accounts. This is the
contract between `backend/` and the clients; `04-architecture.md` says why the
service exists and `06-algorithms.md` how it computes what it stores. Version 1,
2026-09-04. Everything is JSON, camelCase, addresses lowercase hex, hashes and
signer ids `0x` plus 64 hex digits, amounts as decimal strings in the token's
smallest unit (USDC has 6 decimals), times as unix seconds.

All routes sit under `/api/treasury` and need the bearer session the rest of the
API uses (`Authorization: Bearer <accessToken>`; `lib/session.ts` refreshes it).
Errors are `{ "error": "<message>" }` with the usual status codes: 400 for a
request the service cannot use, 401 without a session, 403 for an account the
caller is not a member of, 404 for a missing thing, 409 for a state conflict
(a slot already executed, a proposal that cannot take that action), 502 when the
chain or the relayer failed.

## Signing in with a wallet

The console's only door, the way Squads opens on a connected wallet: the address
is the identity. Two public routes under `/api/auth`:

```
POST /api/auth/wallet/challenge  { address }     -> { message, nonce, expiresAt }
POST /api/auth/wallet  { address, nonce, signature }
                                                 -> SessionGrant (the same shape /api/auth/google returns)
```

The wallet signs `message` with `personal_sign` (EIP-191), verbatim. The text is
built by the service from the checksummed address, a single-use nonce and the
nonce's expiry, so the service rebuilds it from what it stored and a signature
over anything else recovers a different address:

```
Sign in to Olien

Address: 0xAbC…
Nonce: 0x…
Expires: 1757000000
```

A nonce lives five minutes and is consumed on first use. The account the session
belongs to has `provider` `wallet` and `providerUserId` equal to the lowercase
address; the same address always maps to the same account. The address is linked
(below) in the same transaction, so every Olien naming it as a signer is visible
from the first sign-in.

## Who may see an account

A user sees an account when they created it or when one of the account's ECDSA
signers is an address the user has linked. Wallet sign-in links its own address;
these routes link further addresses to the same session, which the iOS app and
tests use. Linking proves control of the address once; every account that names
it as a signer becomes visible.

```
GET  /api/treasury/linked-addresses            -> [{ address, linkedAt }]
POST /api/treasury/link-address  { address, signature }
                                                -> { address, linkedAt }
```

The signature is `personal_sign` (EIP-191) over exactly this text, with the address
lowercase and the account id decimal, newline-separated, no trailing newline:

```
Recourse treasury link
address: 0xabc…
account: 42
```

The service recovers the signer and refuses anything else. Signatures with `v` of
0 or 1 are lifted to 27 or 28.

## Accounts

```
GET  /api/treasury/accounts                      -> [AccountSummary]
POST /api/treasury/accounts                      -> AccountView   (creates on chain, waits for the receipt)
GET  /api/treasury/accounts/{address}            -> AccountView
```

`POST /accounts` sends the creation transaction from the relayer and answers only
when the receipt is in, ten to thirty seconds on testnet, so a client shows a
waiting state rather than retrying. Body:

```json
{
  "name": "Northwind treasury",
  "signers": [
    { "kind": "ecdsa", "address": "0x…", "label": "Ada (Ledger)", "permissions": ["approve", "veto"] },
    { "kind": "ecdsa", "address": "0x…", "label": "Grace" }
  ],
  "threshold": 2,
  "vetoThreshold": 0,
  "configDelay": 86400,
  "recoveryDelay": 86400,
  "recoveryCoSignDelay": 0
}
```

`permissions` defaults to `["approve", "veto"]`. Version 1 of the console creates
ECDSA signers only; the service accepts `contract` signers too (`address` of an
Olien or a Safe) so a consumer account can be a member (spec §9). `vetoThreshold`
0 means automatic (spec §7.4). Delays are seconds; `recoveryDelay` under 3600 is
refused by the contract when a recover signer exists. The service builds the
`Init`, predicts the address, sends `createAccount` from the relayer, waits for
the receipt and answers with the live account. The salt is random and stored.

`AccountSummary`:

```json
{ "address": "0x…", "name": "Northwind treasury", "status": "live", "threshold": 2,
  "signerCount": 3, "usdcBalance": "1250000000", "openProposals": 2, "scheduledChanges": 1, "createdAt": 1788600000 }
```

`AccountView`:

```json
{
  "address": "0x…", "name": "…", "status": "live", "chainId": 5042002,
  "implementation": "0x…", "implementationFrozen": false, "epoch": 1,
  "threshold": 2, "vetoThreshold": 0, "effectiveVetoThreshold": 1,
  "configDelay": 86400, "recoveryDelay": 86400, "recoveryCoSignDelay": 0,
  "signers": [
    { "signerId": "0x…", "kind": "ecdsa", "address": "0x…", "label": "Ada (Ledger)",
      "permissions": ["approve", "veto"], "since": 1, "mine": true }
  ],
  "usdcBalance": "1250000000", "entryPointDeposit": "0",
  "lanes": [{ "nonceKey": "0", "chainSequence": 4 }],
  "limits": [
    { "id": 1, "generation": 1, "token": "0x…", "from": "0x…", "amount": "50000000", "remaining": "30000000",
      "period": 86400, "resetAt": 1788700000, "anyDestination": true, "signers": ["0x…"], "destinations": [] }
  ],
  "subAccounts": [{ "index": 0, "address": "0x…", "label": "Payroll" }],
  "createTx": "0x…", "createdAt": 1788600000,
  "membership": { "creator": true, "signerIds": ["0x…"] }
}
```

`signers[].mine` and `membership.signerIds` say which signers the caller controls
through linked addresses; the console uses them to decide whether to offer
"Confirm" and "Veto". `status` is `deploying` while the creation transaction is
pending, `live` after, `disabled` if the once-per-account hash self-check failed
(`06-algorithms.md` §1), in which case every write route answers 409.

## Proposals

```
GET  /api/treasury/accounts/{address}/proposals?status=open,ready,scheduled    -> [ProposalView]
POST /api/treasury/accounts/{address}/proposals                                 -> ProposalView
GET  /api/treasury/accounts/{address}/proposals/{txHash}                        -> ProposalView
POST /api/treasury/accounts/{address}/proposals/{txHash}/confirmations  { signerId, signature }  -> ProposalView
POST /api/treasury/accounts/{address}/proposals/{txHash}/execute                -> ProposalView   (relayer sends execute; waits for the receipt)
POST /api/treasury/accounts/{address}/proposals/{txHash}/cancel                 -> ProposalView   (a new proposal carrying cancel(txHash))
DELETE /api/treasury/accounts/{address}/proposals/{txHash}                      -> 204            (only while it has no confirmations)
```

`POST /proposals` body. `calls` is the batch exactly as the account will run it;
`kind` and `intent` are what people see. The service refuses a call to the
account itself whose selector is outside spec §6.2 (it would revert), and it
refuses `validUntil` more than 30 days out.

```json
{
  "kind": "transfer",
  "intent": { "recipients": [{ "to": "0x…", "amount": "250000000", "label": "Acme Ltd", "memo": "Invoice 1042" }], "token": "0x…" },
  "calls": [{ "to": "0x3600000000000000000000000000000000000000", "value": "0", "data": "0xa9059cbb…" }],
  "nonceKey": "0",
  "sequence": null,
  "validAfter": 0,
  "validUntil": null
}
```

`kind` is one of `transfer`, `batch`, `signer_change`, `rule_change`,
`limit_change`, `cancel`, `contract_call`. `nonceKey` defaults to `"0"`;
`sequence` null means the next free slot in the lane, a number means compete for
that slot. `validUntil` null means 7 days from now. Convenience builders exist so
the console does not encode calldata for the common cases; each answers the same
`ProposalView`:

```
POST /api/treasury/accounts/{address}/proposals/transfer       { recipients: [{ to, amount, label?, memo? }], token?, nonceKey?, validUntil? }
POST /api/treasury/accounts/{address}/proposals/signers        { add: [{ kind, address, label, permissions }], remove: [signerId], replace: [{ signerId, with: {…} }], threshold?, vetoThreshold?, delays?: { configDelay, recoveryDelay, recoveryCoSignDelay } }
POST /api/treasury/accounts/{address}/proposals/limit          { id?: null, token, amount, period, anyDestination, signers: [signerId], destinations: [address], subAccount?: null }
POST /api/treasury/accounts/{address}/proposals/remove-limit   { id }
```

A `signers` proposal is one batch of `addSigner`, `removeSigner`,
`replaceSigner`, `setThreshold`, `setVetoThreshold`, `setDelays` calls in that
order; the console sends the target state and the service computes the calls. It
is a configuration batch, so executing it schedules it (spec §8.1) and the
`ProposalView` says so in `hardRules` before anyone signs.

`ProposalView`:

```json
{
  "txHash": "0x…", "account": "0x…",
  "nonceKey": "0", "sequence": 4, "nonce": "4", "epoch": 1,
  "kind": "transfer", "intent": { … },
  "calls": [{ "to": "0x…", "value": "0", "data": "0x…" }],
  "decoded": [{ "to": "0x…", "label": "USDC", "summary": "transfer 250.00 USDC to 0x… (Acme Ltd)", "selector": "0xa9059cbb", "readable": true }],
  "validAfter": 0, "validUntil": 1789200000,
  "path": "threshold",
  "status": "open",
  "confirmations": [{ "signerId": "0x…", "address": "0x…", "label": "Ada (Ledger)", "kind": "offchain", "signedAt": 1788600100 }],
  "required": 2, "approvals": 1,
  "missing": [{ "signerId": "0x…", "label": "Grace", "mine": true }],
  "blockedBy": null,
  "hardRules": [{ "rule": "delay", "seconds": 86400, "text": "Executing schedules this change for 24 hours; 1 veto stops it." }],
  "simulation": { "ok": true, "error": null, "checkedAt": 1788600050 },
  "scheduledReadyAt": null, "scheduledWindowEndsAt": null, "scheduledExcluded": null,
  "vetoes": [], "effectiveVetoThreshold": 1,
  "executedTx": null, "executedAt": null,
  "proposer": { "accountId": 42, "name": "Ada" }, "createdAt": 1788600000,
  "typedData": {
    "domain": { "name": "Olien", "version": "1", "chainId": 5042002, "verifyingContract": "0x…" },
    "types": {
      "EIP712Domain": [{ "name": "name", "type": "string" }, { "name": "version", "type": "string" }, { "name": "chainId", "type": "uint256" }, { "name": "verifyingContract", "type": "address" }],
      "Call": [{ "name": "to", "type": "address" }, { "name": "value", "type": "uint256" }, { "name": "data", "type": "bytes" }],
      "Transaction": [{ "name": "nonce", "type": "uint256" }, { "name": "epoch", "type": "uint64" }, { "name": "calls", "type": "Call[]" }, { "name": "validAfter", "type": "uint48" }, { "name": "validUntil", "type": "uint48" }]
    },
    "primaryType": "Transaction",
    "message": { "nonce": "4", "epoch": 1, "calls": [{ "to": "0x…", "value": "0", "data": "0x…" }], "validAfter": 0, "validUntil": 1789200000 }
  }
}
```

`status`: `open` (collecting), `ready` (threshold met, slot is next, inside its
validity), `blocked` (threshold met but a lower sequence in the lane is still
open), `executing` (relayer sent it), `executed`, `scheduled` (a configuration
batch waiting out its delay; `scheduledReadyAt` and `scheduledWindowEndsAt`
set), `vetoed`, `cancelled`, `replaced` (another transaction took the slot),
`stale` (the epoch moved), `expired`, `failed` (the relayer's transaction
reverted; the slot is still free).

A confirmation is `{ signerId, signature }`. For an ECDSA signer the signature is
the 65-byte `eth_signTypedData_v4` result over `typedData`; the service checks
it as the contract will (`06-algorithms.md` §4) and answers 400 with the reason
otherwise. An empty signature means "I called `approve(hash)` on chain"; the
service checks `isApproved` before storing. The client must compute
`hashTypedData(typedData)` itself and refuse to sign when it differs from
`txHash`: the hash is what a hardware wallet shows, and the console shows it too.

`execute` is accepted when `status` is `ready`. The relayer packs the entries in
ascending signer id order, calls `execute`, waits for the receipt, and answers
with the proposal as the indexer will see it (`executed`, or `scheduled` for a
configuration batch). A revert answers 502 with the decoded error name when it
is one of the account's (`Stale`, `Dead`, `Expired`, `InvalidSignatures`,
`SelfCallRefused`…) and marks the proposal `failed`.

## Scheduled changes

```
GET  /api/treasury/accounts/{address}/scheduled                       -> [ScheduledView]
GET  /api/treasury/accounts/{address}/scheduled/{hash}/veto-call      -> { to, data, signerIds: ["0x…"] }
POST /api/treasury/accounts/{address}/scheduled/{hash}/execute        -> ProposalView   (relayer calls executeScheduled)
```

`ScheduledView` is a `ProposalView` with `status: "scheduled"`; `vetoes` lists
`{ signerId, label, tx, at }` and `effectiveVetoThreshold` says how many end it.
A veto is sent by the signer's own wallet, not the relayer: `veto-call` answers
the calldata (`veto(bytes32)` to the account) and the caller's signer ids that
may still veto (holding VETO, not `scheduledExcluded`, not already counted). The
wallet pays the gas in USDC. The indexer turns `Vetoed` and `Cancelled` into
`vetoes` and `status: "vetoed"` within one indexing interval.

## Ledger and address book

```
GET  /api/treasury/accounts/{address}/ledger?limit=100&before=<id>   -> [LedgerEntry]
GET  /api/treasury/accounts/{address}/address-book                     -> [AddressBookEntry]
POST /api/treasury/accounts/{address}/address-book  { address, label, category? }  -> AddressBookEntry
```

`LedgerEntry`: `{ id, tx, logIndex, token, symbol, direction: "in" | "out",
counterparty, counterpartyLabel, amount, blockNumber, blockTime, proposalTxHash,
limitId, subAccount, memo }`. Entries come from USDC `Transfer` logs where the
account or one of its sub-accounts is a party; `memo` and `counterpartyLabel`
come from the proposal's intent and the address book.

`AddressBookEntry`: `{ address, label, category, createdAt }`; `category` is an
empty string when none was given. Posting an address that exists replaces its
label and category.

## What the indexer guarantees

Every view above is served from Postgres and refreshed by the indexer at the
backend's `INDEX_INTERVAL_SECS` (15 s on Railway). After a write route returns,
the state it reports is already what the chain shows; other members see it on
their next fetch. Nothing in the service is authoritative over the chain: a
proposal the chain says executed is `executed` even if the service never sent it,
and a slot the chain consumed makes every other proposal at it `replaced`.
