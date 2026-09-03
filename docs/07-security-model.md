# Security model

What each part of the system can do if it is compromised, and the rules that keep
that bounded. Written before the code, so the code can be checked against it.

## Invariants

1. **No server can move a treasury's money.** The service holds no owner key of any
   treasury. It holds the relayer key (pays gas, gets refunded) and, for Recourse
   consumer accounts, one sealed Recovery Key per account that can only sign owner
   swaps on that account.
2. **Threshold is the floor.** Soft policies can require more signatures than the
   Safe threshold, never fewer. Any single-signature path is an on-chain module with
   an on-chain cap (Allowance), visible in the client as such.
3. **A member approves what they can read.** Every client decodes calldata before
   presenting a signature request; unreadable calldata is labelled and can be
   forbidden by policy; the hash the wallet shows must equal the hash the client
   shows, and the client says so.
4. **Changing the rules is slower than using them.** Owner, threshold, module, guard
   and allowlist changes go through the Delay when a treasury has it; transfers do
   not.
5. **The chain is the truth.** The service's view of owners, threshold, nonce and
   balances is re-derived from logs and `eth_call`, never trusted from its own
   writes.

## What a compromise yields

| Compromised | Can | Cannot | Because |
| --- | --- | --- | --- |
| Transaction service database | read proposals, signatures, labels, invoice data; delete or reorder the queue; forge nothing | execute anything; add a member; change threshold | signatures are over hashes the Safe verifies; every execution needs `threshold` valid owner signatures |
| Transaction service code (hostile deploy) | propose misleading intents with honest calldata? No: clients decode calldata themselves; propose calldata with a misleading label | get members to sign what they did not read, if clients enforce invariant 3 | decoding and simulation happen in the client, from the calldata, not from the service's label |
| Relayer key | drain its own gas balance | touch a treasury | it submits transactions whose effects are fixed by the signatures |
| One member's key | sign proposals; spend up to their Allowance if one exists | reach threshold alone | threshold ≥ 2 for every treasury the product creates |
| `threshold` members' keys | spend | change rules instantly, if the Delay is on | the Delay queues rule changes for the cooldown; remaining members can cancel |
| Recourse backend (consumer accounts as members) | co-sign an owner swap on a consumer account after an email code | vote in any treasury; spend from any account | the Recovery Key is not an owner of any treasury and cannot reach the consumer account's threshold alone |
| The web app's front end (supply chain, like the February 2025 incident) | show a false intent | make a hardware wallet show a false hash | the mitigation is the wallet's own hash display plus policy: hardware members must confirm the `safeTxHash` shown on the device matches the one the service returned; the service exposes it in every screen and in the notification |
| RPC provider | lie about balances, nonce, receipts | forge a signature or an execution | cross-check with a second RPC for anything that gates execution (nonce, owners); explorer as a third source for history |

## Roles inside a treasury

| Role | Off-chain | On-chain |
| --- | --- | --- |
| Owner | sees everything, signs, proposes | Safe owner |
| Proposer (finance ops, payroll system) | proposes, cannot sign | none, or an Allowance delegate for capped payouts |
| Viewer (accountant, auditor) | reads ledger and exports | none |
| Delegate with allowance | executes up to the cap with one signature | Allowance module delegate |

## Key custody per member kind

- **Hardware wallet:** the gold standard for large treasuries; the product supports
  it from day one through the browser wallet bridge, and shows the `safeTxHash` for
  device comparison.
- **Browser wallet:** acceptable for small teams; policy can require at least one
  hardware or Recourse signer above an amount.
- **Recourse account:** two keys on a phone, recovery by email plus Cloud Key. No
  seed phrase. The Recovery Key cannot vote in a treasury.
- **Passkey:** synced through iCloud or Google; convenient, one anchor. Never the sole
  signer above the small-amount tier.

## Hard versus soft, in the interface

Every rule is labelled with where it is enforced. "On-chain rule" means a module or
guard the chain executes; "Treasury policy" means the service applies it before it
marks a proposal ready. The second kind is honest about its limits: a member holding
`threshold` keys can execute directly against the Safe without the service, so a soft
rule is a workflow, not a wall. Teams that want walls turn on the Delay, the
Allowance caps and, if they need it, the guard.

## Delay windows

| Change | Default cooldown | Who can cancel during it |
| --- | --- | --- |
| Add or remove owner, change threshold | 24 hours | the Safe (any `threshold` owners), by advancing the Delay nonce |
| Enable or disable module, set guard | 24 hours | same |
| Allowlist and allowance changes | 24 hours | same |
| Transfers | none | not applicable |

Braavos ships 4 days and Argent 48 hours for comparable changes; 24 hours matches
the consumer design and is short enough that replacing a lost member key is a
next-day job rather than a week.

## Things the product will not do

- Hold a treasury's owner key "for convenience".
- Offer a single-signature treasury.
- Execute a proposal whose calldata it could not decode without the members having
  seen the raw bytes and a warning.
- Let a soft policy lower the number of required signatures below the threshold.

## Lessons taken from incidents elsewhere

- **Drift, April 2026 (Squads, 2-of-5, no time lock).** Signers were led to approve
  proposals whose execution was held back and fired later. Taken: approvals expire
  (`06-algorithms.md` §5), a rule change makes open proposals stale, a time lock on
  rule changes is on by default for treasuries above a size, and the client never
  shows an approval as "safe to give" without the decoded intent and the hash.
- **Safe front end, February 2025.** A hostile build of the web client showed one
  transaction and had signers approve another. Taken: the hash on the hardware
  device is the truth; the service exposes it everywhere; unreadable calldata is
  flagged; a static, verifiable build of the client is published so members can
  check what they are running, as Squads does with its public client.
- **Chains where the program is frozen cannot fix bugs.** Safe 1.4.1 is not
  upgradeable either, which is a feature, so the rules that need to evolve live in
  modules and in the service, never in a fork of the account.

## Incident playbook, minimum

- Relayer key leak: rotate the key, top up the new one, the treasuries are unaffected.
- Service compromise: freeze proposing and relaying; members can still execute
  through Safe{Wallet}-compatible tooling or a CLI with their own keys, because the
  contracts are canonical Safe. This is the reason to stay on canonical Safe rather
  than a custom account.
- Member key leak: the remaining members propose `swapOwner` through the Delay; the
  leaked key can sign but not reach threshold; allowances of that member are
  revoked in the same proposal.
