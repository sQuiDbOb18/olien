# Landscape

What the products this one is measured against actually do, with sources. Squads and
Safe are the two reference points; the consumer wallets are here because the
consumer app is a member of the treasury and their key models shaped it. Facts are
marked confirmed from a primary source (the program, the docs, the chain) or
secondary; nothing here is guessed.

## Squads (Solana)

The default multisig on Solana since 2021, and the closest thing to what this folder
designs.

**Program (v4).** `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`, Anchor, AGPL-3.0,
immutable since November 2024 (upgrade authority is null on mainnet); audited by
Trail of Bits, Neodyme, OtterSec and Certora with formal verification
(github.com/Squads-Protocol/v4; docs.squads.so security pages). Account model:

- `Multisig` (create key, config authority, threshold, time lock up to 90 days,
  transaction index, stale transaction index, rent collector, members with a
  permission mask `Initiate=1, Vote=2, Execute=4`).
- Vaults are data-less PDAs indexed 0..255 under the multisig: sub-accounts with the
  same member set.
- `Proposal` with `approved`, `rejected`, `cancelled` vectors and a status
  (`Draft, Active, Rejected, Approved, Executed, Cancelled`); `VaultTransaction`
  carrying a compiled message; `ConfigTransaction` with actions (add or remove
  member, change threshold, set time lock, add or remove spending limit); `Batch`
  approved once and executed serially; `SpendingLimit` (vault index, mint, amount,
  period one-time/day/week/month, remaining, last reset, members, destinations).
- Lifecycle: create transaction, create proposal, approve or reject, `Approved` at
  threshold, execute after the time lock. Config changes bump the stale index so
  older approved config transactions cannot execute.
- Rent: about 0.005 SOL per simple proposal, reclaimable by closing accounts.

**Squads Smart Account Program (v0.1, runs "Grid").**
`SMRTzfY6DfH5ik3TKiyLFfXexV8uSG3d2UksSCYdunG`, still upgradeable by a Squads key,
audited by OtterSec and Certora. Adds policies as consensus accounts (spending limit,
settings change, internal fund transfer, program interaction with data constraints),
synchronous execution with the signers in the transaction (no proposal accounts, no
rent) when the time lock is zero, and a settings-state hash that expires a policy
when the member set changes. No on-chain passkey verifier; Grid does WebAuthn
through a hosted proxy.

**Product.** Dashboard, transactions (Active, Ready, Cancelled; any member executes
Ready), roles (Proposer, Voter, Executor, Almighty), fee relayer (the Squad as
paymaster), sub-accounts, contacts, recurring payments, trade (Jupiter, 0.25% fee),
staking, program upgrade management, spending limits and time locks in settings, CSV
export, a browser extension that makes a multisig usable as a dapp wallet, and
on/off-ramp partners (virtual US bank account, Sphere, Coinflow, Bridge). Pricing:
Basic free plus 0.1 SOL to deploy; Pro 49 USD a month, paid by a spending limit the
Squad grants to Squads; Enterprise custom. Grid (the developer product): free to 1k
monthly users, 499 USD a month for 5k with fee sponsorship, Enterprise with ramps and
KYC. There is no server of record for "who signed": the proposal account on-chain is
the truth and every device reads it.

**Traction and money.** Seed 1.5M USD, 5M USD (Multicoin, 2022), 5.7M USD
(Placeholder, 2023), 10M USD Series A (Electric, 2024), 18M USD (Solana Ventures,
April 2026); claims 15B USD secured, 5B USD in stablecoin transfers, 450 teams. The
wedge was program upgrade authority for Solana protocols, then DAO treasuries, then
teams. No Solana Foundation grant found; the Foundation's venture arm is an investor.

**What went wrong.** Drift, 1 April 2026: 285.3M USD taken from a 2-of-5 Squads
multisig whose time lock had been removed days earlier; signers were led to approve
proposals through pre-signed durable-nonce transactions that were executed later.
Approvals in v4 never expire and the frozen program cannot add defences, so Squads
shipped a separate audited "nonce guard". Other frozen-program bugs: stale approved
vault transactions still execute; spending-limit members are not tied to membership.
UX criticisms: asynchronous execution breaks dapp interfaces, rent must be reclaimed
by hand, sub-accounts and permissions are paywalled, the fee relayer depends on
Turnkey.

**Taken into this design.** Roles beyond owner; sub-accounts as child Safes; a stale
index (`owners_snapshot`); approvals that expire; time lock on rule changes by
default; the subscription paid through a spending allowance; a public verifiable
client for outages; and the choice to keep the account canonical and unforkable while
the rules evolve in modules and the service.

## Safe (Ethereum and every EVM)

What is on Arc today, confirmed by code size and by transactions (`02-arc-facts.md`):
Safe 1.4.1 canonical contracts, the 4337 module, MultiSend, the fallback handler,
and the singleton factory that lets anyone deploy the rest at canonical addresses.
What is not: the Allowance module, Zodiac Delay and Roles, recovery modules, the
passkey signer factory, and the entire product layer (Safe{Wallet}, the transaction
service, the client gateway, chain registration in Safe's deployment lists for
modules).

Safe's shape that this design keeps: owners and threshold on the account; `SafeTx`
EIP-712 hashing with a two-field domain; signatures packed in owner order with
contract owners verified through the legacy `isValidSignature(bytes,bytes)`; modules
that execute through `execTransactionFromModule`; guards that run before and after
every execution; native gas refunds to a relayer. The details of Safe's transaction
service, its new-network process and the module audits are added to this document
as the research lands.

## Who is on Arc already

- **Bron**: a non-custodial team wallet with multisig and roles that lists Arc among
  19 chains; 16, 166 and 1,666 USD a month plus 0.10 to 0.60 percent swap fees
  (bron.org). The closest thing to a competitor; not Safe-based, not open.
- **Circle's "Arc Fintech Starter"** (April 2026): a treasury console built on
  developer-controlled MPC wallets, Bridge Kit and Gateway; single-approver by
  construction (circle.com blog "build a multichain treasury system on Arc").
- **ArcFlow**: a payroll treasury that won the Arc track at HackMoney 2026, a track
  Arc titled "Build Global Payouts and Treasury Systems with USDC on Arc"; a
  hackathon project, not a product. **Zebec** (payroll streaming) joined the testnet.
- Custodians on the testnet cohort: Fireblocks, BitGo, Copper, Taurus, Zodia; wallets
  Ledger, MetaMask, Rainbow, Exodus, Vultisig; account-abstraction vendors Pimlico,
  ZeroDev, Dynamic, Privy, Turnkey, Crossmint, Thirdweb, Biconomy, Para, Blockradar.
  None is a shared-treasury product.

## Policy engines: how the rest of the industry says "who can move what"

Studied for the rules screen (`06-algorithms.md` §6); primary sources are the API
schemas and contracts.

- **Fireblocks TAP**: an ordered rule list, first match wins, unmatched is blocked.
  Fields: `action` (ALLOW, BLOCK, 2-TIER), `transactionType`, `amount` with
  `amountScope` SINGLE_TX or TIMEFRAME plus `periodSec`, `src`/`dst` typed selectors,
  `dstAddressType` WHITELISTED or ONE_TIME, `operators` (initiators),
  `authorizationGroups` (AND/OR of m-of-n groups), `designatedSigners`. Policy edits
  need an admin quorum. Enforced by Fireblocks' server before its MPC co-signer signs.
- **BitGo**: rule types `velocityLimit`, `coinAddressWhitelist`, `advancedWhitelist`,
  `webhook`; actions `deny`, `getApproval`, `getFinalApproval`; `timeWindow` up to 30
  days; you cannot approve your own policy change; transactions signed with the user
  key and the backup key bypass policies entirely.
- **Coinbase Prime**: m-of-n within x hours, transfer policies by type, destination,
  currency and size tier, video approvals, a trusted address book gated by consensus
  and hardware keys. Coinbase's developer platform: ordered `accept`/`reject` rules
  with criteria on value, address, network, calldata and net USD change; default
  reject.
- **Anchorage**: quorum policies and destination allowlists enforced in hardware
  security modules; least programmable, most tamper-resistant.
- **Turnkey**: `{effect, consensus, condition}`; root quorum bypasses; any DENY wins;
  a predicate language over `eth.tx.to/value/data/contract_call_args`,
  `approvers.count()`; no native cumulative limits.
- **Privy**: per-method rule lists with `field_source` (transaction, calldata, typed
  data), operators, ALLOW/DENY; any DENY wins; default deny; policy ownership by a key
  quorum; amount limits need simulation outside the enclave.
- **Squads**: `SpendingLimit` (mint, amount, period, members, destinations) checked by
  the program; `time_lock` between approval and execution; permission masks.
- **Safe Allowance module**: per delegate per token, amount and reset period, **no
  destination check**. **Zodiac Roles v2**: per-target, per-selector, per-parameter
  conditions with refilling allowances for amounts, native value and call counts;
  delegatecall gating. **Zodiac Delay**: cooldown and expiration on a module queue,
  cancellation by advancing the nonce. **Coinbase Spend Permissions**: signed
  `{account, spender, token, allowance, period, start, end}` with fixed windows.
  **Argent v1**: rolling 24-hour daily limit with delayed whitelist changes and a
  security window for over-limit transfers. **Braavos**: a low limit for the weak
  signer, a high limit for the strong signer, full multisig above, in USDC.

The pattern across all of them: amount per period, allowlisted destinations,
per-member limits, tiers by amount, time locks, and a quorum on changing the rules
themselves. Server-side engines express anything and put the vendor in the signing
path; on-chain modules are trust-minimised and limited to what calldata exposes.
This design uses both and labels which is which.

## Invoices, references and accounting

- **Request Network** stores an invoice as a signed document on IPFS with its hash
  on-chain, derives an 8-byte `paymentReference` from the request id, a salt and the
  payee address, and pays through a fee proxy that emits
  `TransferWithReferenceAndFee` with the reference indexed; balance is the sum of
  events with that reference, so partial payments fall out for free. Its API can
  produce Safe-sized calldata and track a `safeTxHash` for settlement. Batch payments
  hold 100 to 200 transfers per transaction.
- **Standards**: ERC-681 payment URLs (no memo); ERC-7699 (draft) transfers with a
  logged reference. EIP-3009 authorizations carry a nonce but no memo, so a
  reference has to ride in our own event or in the invoice id known before payment.
- **Accounting tools** (Bitwave, Cryptio, Integral, Tres, now owned by Fireblocks)
  sync to QuickBooks, Xero, NetSuite and Sage, apply cost-basis methods, and read
  Safe through its transaction service. Safe{Wallet}'s own export is a value-only CSV
  and a local address book CSV. US rules to know: ASC 350-60 fair-value accounting
  for digital assets from fiscal 2025; 1099-DA broker reporting from 2025 sales.
- **Payroll products**, from their docs and contracts:
  - *Rise*: pay cycles weekly to monthly with auto-payroll; every action is an
    on-chain transaction on Arbitrum signed as EIP-712 typed data and **Rise pays the
    gas**; a "RiseID" contract holds a company's wallets with roles, and a Safe can
    be its owner or delegate; workers hold a Rise balance and choose fiat or crypto
    each cycle (a pull after the payer pushed); 1099 and W-8/W-9 issued
    automatically; 49 USD per contractor a month.
  - *Toku*: the compliance layer (EOR and AOR in 100+ countries, withholding computed
    on fiat-denominated gross, token grant administration); employers fund a
    payroll wallet in USDC, recipients receive to any wallet including multisigs.
  - *Request Finance*: salaries are invoices with a recurring rule; batch payments
    from CSV with one approval through `BatchNoConversionPayments`, which pulls the
    tokens once and distributes through the fee proxy with a fee in basis points
    capped at 150 USD; a Safe app for bill pay; stablecoin payouts free, fiat
    off-ramp 0.5 percent.
  - *Streams*: Superfluid (funds stay in the sender's balance, a buffer covers
    insolvency, sentinels close streams), Sablier Lockup (deposit locked up front)
    and Flow (no deposit, contract tracks debt, pause and refund), LlamaPay (shared
    payer balance, fee-free), Hedgey (vesting plans as NFTs). None needed for a
    first version; the batch plus the cheque covers what a team pays monthly.
  - *Franklin* (non-custodial, gas-subsidised, W-2 and 1099), *Deel* (custodial
    withdrawals through Coinbase at 1.5 percent). Utopia Labs' team went to Coinbase
    in 2024; Coinshift sunset its Safe treasury product in March 2026; Parcel is
    gone. The category is thin on every chain and empty on Arc.
- **Circle's own pieces a payroll on Arc can use**: the Compliance Engine screens
  inbound and outbound transfers per call (DENIED and REVIEW decisions), Gateway
  gives a unified USDC balance across chains with a 7-day trustless withdrawal, CCTP
  v2 moves USDC to and from Arc in seconds. x402, Coinbase's payments protocol, uses
  the same `transferWithAuthorization` this design uses for cheques, with random
  32-byte nonces and a validity window that starts ten minutes in the past.

## Consumer wallets that inform the member model

Researched for the consumer account (`../keys-and-recovery.md`) and reused here
because a treasury member is one of these.

- **Fuse** (Solana, on Squads): two active keys (Device Key in the phone behind
  Face ID, 2FA Key in iCloud or a Ledger) sign every spend; up to three recovery keys
  (email through Turnkey, Phantom, Backpack, Ledger) that can only approve; a fresh
  wallet is 1-of-2 until a recovery key is added; spending limits are an opt-in
  carve-out; no delay documented; Fuse holds no key.
- **Daimo** (EVM, 4337): 1-of-n P-256 keys in slots (phone, computer, passkey backup,
  seed phrase backup), no delay.
- **Coinbase Smart Wallet**: passkey owner plus an optional recovery signer that can
  add a new passkey.
- **Argent**: guardians, recovery finalises after 48 hours unless cancelled.
- **Braavos**: two limits (weak signer below one, strong signer below the other,
  full multisig above), 4-day delay on security changes.
- **Circle Modular Wallets** (on Arc testnet): ERC-6900 account with a passkey owner,
  a recovery EOA, Gas Station sponsorship, an on-chain weighted multisig plugin with
  no public API.

## What is missing on Arc, in one line each

- A place where a team's owners see the same pending transaction and sign it.
- A service that knows which nonce is next and which proposals are stale.
- Spending limits and time locks deployed and usable.
- Payroll and payables that use the chain's own signed-authorization feature.
- A client that decodes what a signature means before asking for it.
