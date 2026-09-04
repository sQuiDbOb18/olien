# Security model

What each part of the system can do if it is compromised, and the rules that keep
that bounded. Written before the code, so the code can be checked against it. The
contract's own invariants are `10-account-spec.md` §15 ("spec" below): seventeen
properties a test suite and an audit check. This document keeps the product-level
ones and maps threats to both.

## Invariants

The contract level (spec §15), one line each: no execution without one of the five
authorization paths; the threshold is the floor for arbitrary calls; rules change
slower than money moves when the account says so; a dead hash stays dead; an epoch
change invalidates everything; nonces never repeat; signature sets are exact; a key
is checked as its kind; spending limits hold their budget, destinations and
signers; recovery cannot escalate; the account is never bricked; frozen means
frozen; sub-accounts obey one parent; no delegatecall; EIP-1271 answers are bound
to the account; what a user operation validated is what it executes; a signer
cannot brake its own removal by the quorum.

The product level:

1. **No server can move a treasury's money.** The service holds no APPROVE key of
   any treasury. It holds the relayer key, which pays gas and is repaid by the
   EntryPoint only for operations the account's signers authorized. For Recourse
   consumer accounts it holds one sealed Recovery Key per account, a RECOVER signer
   there: it can propose one signer replacement of equal permissions behind
   `recoveryDelay`, never under an hour, shortened only when a plain approver
   (APPROVE without RECOVER) co-signs, and nothing else (spec §6.3, §7.5, §15.10).
2. **Threshold is the floor.** Soft policies can require more APPROVE signatures
   than the account's threshold, never fewer. Any single-signature path is a
   spending limit inside the account with a cap, a period and a destination list,
   visible in the client as such (spec §15.2, §15.9).
3. **A member approves what they can read.** Every client decodes calldata before
   presenting a signature request; unreadable calldata is labelled and can be
   forbidden by policy; the hash the wallet shows must equal the hash the client
   shows, and the client says so.
4. **Changing the rules is slower than using them.** Signer, threshold, veto
   threshold, delay, spending limit and implementation changes are scheduled
   behind `configDelay` and can be vetoed during the wait; transfers are not
   (spec §15.3). Taking a power away is not slowed either: removing a limit and
   cancelling a hash run at once under the threshold (spec §6.2).
5. **The chain is the truth.** The service's view of signers, threshold, epoch,
   nonces, limits and balances is re-derived from logs and `eth_call`, never trusted
   from its own writes.

### What the review added

The draft specification was reviewed adversarially before any code (26 findings,
spec §19). Four properties came out of it that the tests and the audit check by
name:

- **What a user operation validated is what it executes.** The callData is always
  `executeUserOp(calls)`, the EntryPoint hands the whole operation back with its
  hash, and the decision validation made (path, delay, the single signer or the
  excluded one) is kept in transient storage under that hash and rechecked for
  epoch and death at execution. Two operations in one bundle cannot swap paths
  (spec §10, §15.16).
- **A signer cannot brake its own removal by the quorum.** Vetoes apply to
  scheduled changes only, and on the threshold path the signer a change removes
  is `excluded` from vetoing it. On the recovery path the replaced signer can
  veto, which is the consumer's protection against a stolen mailbox (spec §8.3,
  §15.17). A pending transaction with harvested approvals is killed by the
  threshold's `cancel` or dies at `validUntil`, required and at most 30 days
  (spec §6.1, §8.4).
- **The recovery co-signer is a distinct plain approver.** The delay shortens to
  `recoveryCoSignDelay` only when an approver holding no RECOVER bit co-signs, so
  a key that is both guardian and approver cannot shorten its own delay; recovery
  is exactly one standard-encoded `replaceSigner` with equal permissions (spec
  §6.2, §6.3, §15.10).
- **A guardian alone always waits at least an hour.** `_checkConfig` refuses a
  `recoveryDelay` under `MIN_RECOVERY_DELAY` while any signer holds RECOVER, so
  no configuration, however mistaken, yields an instant guardian (spec §7.5,
  §15.3).

## What a compromise yields

| Compromised | Can | Cannot | Because |
| --- | --- | --- | --- |
| Transaction service database | read proposals, signatures, labels, invoice data; delete or reorder the queue; forge nothing | execute anything; add a signer; change threshold | signatures are over hashes the account verifies; every execution needs `threshold` valid APPROVE entries (spec §15.1, §15.7) |
| Transaction service code (hostile deploy) | propose calldata with a misleading label | get members to sign what they did not read, if clients enforce invariant 3 | decoding and simulation happen in the client, from the calldata, not from the service's label |
| Relayer key | drain its own gas balance; submit or withhold executions | touch a treasury; change what a transaction does | `execute` runs only the calls whose hash the signatures cover; a withheld execution is submitted by any member from any client |
| One signer's key | sign proposals; spend up to a limit it is named on; veto scheduled changes if it has VETO, except its own removal by the quorum; schedule a recovery if it has RECOVER, never in under an hour | reach threshold alone; escalate through recovery; block its own removal | threshold ≥ 2 for every treasury the product creates; recovery replaces with equal permissions behind a delay the others can veto (spec §15.10); the removed signer is excluded from the veto (spec §8.3, §15.17) |
| `threshold` signers' keys | spend, immediately; cancel any pending hash and remove any limit, immediately | change the rules immediately, when `configDelay > 0` | config calls are scheduled for `configDelay` and the VETO signers kill the hash at the effective veto threshold, whose automatic value is the smallest number of approver-vetoers that makes the threshold unreachable (spec §7.4, §8); the client warns when an account sets the delay to 0 |
| Recourse backend (consumer accounts as signers) | with its sealed Recovery Key, a RECOVER-only signer: schedule one signer replacement of equal permissions on a consumer account after an email code, behind `recoveryDelay` (24 hours by default, never under an hour); shorten that to `recoveryCoSignDelay` only when a plain approver, the user's cloud key (APPROVE, no RECOVER), co-signs | spend from any account; vote in any treasury; change any threshold, delay or limit; add a signer; act alone in under an hour; co-sign its own recovery | RECOVER is not APPROVE; recovery is exactly one standard-encoded `replaceSigner` with equal permissions (spec §6.2, §6.3, §15.10); the co-signer must hold APPROVE without RECOVER; `recoveryDelay >= MIN_RECOVERY_DELAY` whenever a RECOVER signer exists (spec §7.5); either of the user's keys sees `Scheduled` and vetoes, the replaced one included (spec §8.3) |
| The web app's front end (supply chain, like the February 2025 incident) | show a false intent | make a hardware wallet show a false hash; turn a call into a delegatecall | there is no delegatecall in the account (spec §15.14); the hash on the device is the truth; hardware members confirm the `txHash` the device shows matches the one the service returned, which it exposes in every screen and in the notification |
| RPC provider | lie about balances, epoch, nonces, receipts | forge a signature or an execution | cross-check with a second RPC for anything that gates execution (nonces, signers, epoch); explorer as a third source for history |
| The account contract itself (a bug) | whatever the bug allows | be patched from outside | see "Contract risk" below |

## Roles inside a treasury

Roles map to permission bits (spec §3). A signer with no bits at all is a delegate
under a limit and nothing more.

| Role | Off-chain | On-chain |
| --- | --- | --- |
| Approver | sees everything, signs, proposes | signer with APPROVE |
| Approver who can also brake | same, plus a veto on scheduled changes (a pending hash is the threshold's `cancel`, not a veto) | APPROVE and VETO; the consumer account's two keys hold both (`05-onchain-design.md`) |
| Guardian | proposes a signer replacement for someone who lost a key | signer with RECOVER only; no treasury has one unless it names one |
| Proposer (finance ops, payroll system) | proposes, cannot sign | none |
| Delegate under a limit | spends up to the cap with one signature | signer with no permission bits, named on a spending limit |
| Viewer (accountant, auditor) | reads ledger and exports | none |

## Key custody per signer kind

- **ECDSA, hardware wallet:** the gold standard for large treasuries; the product
  supports it from day one through the browser wallet bridge, and shows the
  `txHash` for device comparison.
- **ECDSA, browser wallet:** acceptable for small teams; policy can require at least
  one hardware, passkey or Recourse signer above an amount.
- **CONTRACT, a Recourse account:** two keys on a phone (a P256 device key in the
  Secure Enclave, an ECDSA cloud key), recovery by email plus Cloud Key. No seed
  phrase. Its Recovery Key is a RECOVER signer of that account only and cannot vote
  in a treasury.
- **WEBAUTHN, passkey:** synced through iCloud or Google; convenient, one anchor.
  The account checks the authenticator flags, and `UV_REQUIRED` makes a signature
  without user verification (biometric or PIN) invalid (spec §5.2); origin,
  rpIdHash and the counter are unchecked on purpose (spec §5.2,
  `09-open-questions.md` item 7). Never the sole signer above the small-amount
  tier.
- **P256, raw key:** a P-256 key with no WebAuthn envelope, for a Secure Enclave or
  an HSM the client drives directly; the client normalises `s` low.
- **CONTRACT, other:** another Concord, a Safe, or any EIP-1271 contract; its own
  rules apply and the treasury cannot see inside them.

## Hard versus soft, in the interface

Every rule is labelled with where it is enforced. "On-chain rule" means the account
enforces it; "Treasury policy" means the service applies it before it marks a
proposal ready. The second kind is honest about its limits: a member holding
`threshold` keys can execute directly against the account without the service, so a
soft rule is a workflow, not a wall. Teams that want walls set `configDelay`,
spending limits with destination lists and, for a brake, VETO signers.

## Delay windows

| Delay | Applies to | Default | Who can cancel during it |
| --- | --- | --- | --- |
| `configDelay` | add, remove or replace a signer through the threshold; threshold and veto threshold; delays; a spending limit and its signer and destination lists; implementation | 24 hours, treasury and consumer (`05-onchain-design.md`) | VETO signers up to the effective veto threshold; automatic value `max(1, approverVetoerCount - threshold + 1)` over signers holding both APPROVE and VETO; the signer the change removes is excluded (spec §7.4, §8.3) |
| `recoveryDelay` | `replaceSigner` proposed by a RECOVER signer alone | 24 hours; never under 1 hour (`MIN_RECOVERY_DELAY`) | same, and the signer being replaced may veto |
| `recoveryCoSignDelay` | `replaceSigner` by a RECOVER signer plus one APPROVE signer holding no RECOVER | 0 (consumer); treasuries have no RECOVER signer unless they name one | same, when non-zero |
| `validUntil` | every pending transaction and user operation | 7 days in the service; the contract requires a value and caps it at 30 days (`MAX_VALIDITY`) | the threshold, with `cancel`, at once |
| `cancel`, `removeSpendingLimit` | none: immediate self calls under the threshold | not applicable | not applicable |
| Transfers | none | not applicable | not applicable |

A scheduled change lapses 7 days after `readyAt` if nobody executes it
(`SCHEDULE_WINDOW`); no delay may exceed 30 days (`_checkConfig`). Braavos ships 4
days and Argent 48 hours for comparable changes; 24 hours matches the consumer
design and is short enough that replacing a lost member key is a next-day job
rather than a week.

## Things the product will not do

- Hold a treasury's APPROVE key "for convenience".
- Offer a single-signature treasury.
- Execute a proposal whose calldata it could not decode without the members having
  seen the raw bytes and a warning.
- Let a soft policy lower the number of required signatures below the threshold.
- Deploy an account whose implementation it can change; only the account's own
  config path can (spec §7.7).

## Lessons taken from incidents elsewhere

Each lesson names what the account does structurally, then what the service and
clients add.

- **Drift, April 2026 (Squads, 2-of-5, no time lock).** Signers were led to approve
  proposals whose execution was held back and fired later. In the account: expiry is
  in the hash (`validUntil`), required and never more than 30 days out; a rule
  change advances the epoch and invalidates every open approval on-chain; a
  harvested approval can be killed by the threshold's `cancel` before it executes;
  `configDelay` is on by default. In the service: a 7-day default
  `validUntil`, and the client never shows an approval as "safe to give" without the
  decoded intent and the hash.
- **Bybit through Safe's front end, February 2025 (about 1.5B USD).** A Safe
  developer's machine was compromised, a session token hijacked, and the JavaScript
  in Safe's hosting bucket edited so that for one target Safe the client swapped `to`
  and flipped `operation` from call to delegatecall, then restored the original data
  after signing; the delegatecall overwrote the account's implementation slot. In the
  account: **there is no delegatecall at all** (spec §15.14), so no client bug can
  reach the implementation slot; the implementation changes only through
  `setImplementation` behind `configDelay` and the veto, or never after
  `freezeImplementation`. In the service and clients: the hash on the hardware
  device is the truth and the service exposes it everywhere; unreadable calldata is
  flagged; third-party scripts are pinned; a static, verifiable build of the client
  is published, as Squads does; and the members' checklist follows Safe's own
  post-incident guidance (verify each call's `to`, `value` and `data`, the lane and
  sequence, and `validUntil`, on a second device).
- **Radiant, October 2024 (about 50M USD, 3-of-11).** Malware on a signer's machine
  showed legitimate data in the interface while hardware wallets signed an ownership
  transfer; "transaction failed" prompts were used to harvest more signatures. In the
  account: administration of the account itself (signers, implementation) is always
  scheduled and vetoable. In the client: it never asks a member to sign the same
  proposal twice without saying why; a failed execution is shown with its receipt,
  not a retry button; contract-administration calls to other contracts (ownership,
  upgrades) are time-locked by soft policy.
- **Ledger Connect Kit, December 2023.** A published package was replaced through a
  phished maintainer account and loaded from a CDN into many front ends. Taken: no
  script loads from a CDN at runtime; dependencies are pinned and integrity-checked.
- **Security Alliance's signing guidance** (adopted as the members' standard for
  large treasuries): two devices and two channels per signer, at least two signers
  simulate independently, simulations can be spoofed so the hash is what is
  compared, and time locks are the backstop.
- **Chains where the program is frozen cannot fix bugs.** Squads v4 is frozen and
  answered Drift with a separate nonce guard; Safe 1.4.1 is not upgradeable either.
  Concord makes it the account's choice: `setImplementation` behind the delay and
  the veto, or `freezeImplementation` forever (spec §7.7, §15.12). The product's
  default is changeable behind the lock (`05-onchain-design.md`); the consumer
  default is open (`09-open-questions.md`).

## Incident playbook, minimum

- Relayer key leak: rotate the key, top up the new one; the treasuries are
  unaffected.
- Service compromise: freeze proposing and relaying. Members execute directly
  against the account with their own keys through any client, because the contract
  needs no service: `execute` is callable by anyone holding the signatures; `veto`,
  `approve` and `spend` from a signer's own address, or through a user operation
  that any EOA can hand to `EntryPoint.handleOps`; `executeScheduled` by anyone.
  The ABI and the hashing are public (spec §4, §6).
- Member key leak: the remaining members propose `replaceSigner` or `removeSigner`
  through the threshold; it waits `configDelay`; the leaked key can sign but not
  reach threshold, and it cannot veto its own removal, because on the threshold
  path the signer a change removes is excluded (spec §8.3, §15.17), so even a
  2-of-2 with the automatic veto threshold of 1 removes a leaked key. Limits
  naming that signer are removed in the same proposal and take effect at once
  (`removeSpendingLimit` has no delay); any pending hash it signed is killed with
  `cancel`.
- Contract bug: accounts that did not freeze can move to a fixed implementation
  through the delayed config path (`setImplementation`, `configDelay`, vetoable);
  frozen accounts sweep to a new account with one threshold transaction. The
  service ships the proposal to every affected account with the decoded intent;
  nothing moves without the members' signatures.

## Contract risk

An own contract carries a risk Safe's does not. Safe 1.4.1 has years of audits and
the volume `01-landscape.md` reports behind its bytecode; Concord has neither until
it earns them. That is the price of P-256 signers, policies inside the account, and
one contract for people and teams (`05-onchain-design.md`). Mitigations, all in
`08-roadmap-and-grants.md`: an adversarial review of the specification before any
code, whose 26 findings changed the design (spec §19); tests against the real
EntryPoint v0.7 bytecode, 61 for Concord plus 58 others, all passing (Phase 1,
done 2026-09-04; the P-256 tests have Daimo's Solidity verifier standing in for
the precompile); a third-party review or contest before any mainnet account holds
money (Phase 4); the consumer app stays on Safe on mainnet until that review
lands; the v1 implementation address is frozen after it; the first treasuries are
small. What the design does structurally to shrink the surface: no delegatecall,
no modules, no hooks, no guards, the P-256 and passkey code in a stateless
verifier outside the account, one implementation per version at a deterministic
address, namespaced storage, a `_checkConfig` that refuses any configuration
without a way to act or with an instant guardian, and no headroom: the account is
about 30 bytes under the code-size limit, so v1 cannot quietly grow.
