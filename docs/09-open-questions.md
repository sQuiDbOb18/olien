# Open questions

What is not decided, and what would change the design if the answer goes the other
way. Each has an owner (you, unless it says research) and a way to settle it. Items
the 2026-09-04 decision, the review of the draft spec (spec §19), the contract, the
product answers given that evening (items 1 to 5) and engineering's calls on the
rest are marked so and kept short; the Safe-only items of the first draft
(Safe{Wallet} hosting, the Delay and 4337 modules together) are gone with it.

## Product

1. **The name.** Settled 2026-09-04: **Olien**. It is the string `Olien` in the
   EIP-712 domain (spec §4), so every hash depends on it; the testnet contracts
   were deployed again under it the same evening and the proofs repeated (spec
   §18), and the placeholder deployment is superseded. Still to do before mainnet:
   a trademark search, and whether the product on top carries the same name.
2. **Who is the first customer?** Settled 2026-09-04: a team on Arc testnet, on
   the console before mainnet money exists (`08-roadmap-and-grants.md` Phase 2).
   Teams formed by the consumer app's own users come after Phase 3. Open inside
   it: which team; three conversations with Arc pilot teams once the market
   research names them.
3. **Payroll first or approvals first?** Settled 2026-09-04: approvals, then
   payroll, then invoices, the order `08-roadmap-and-grants.md` already had.
   Payroll is the revenue story; approvals are the safety story every customer
   needs before payroll.
4. **Consumer migration on mainnet: opt-in or automatic?** Settled 2026-09-04:
   automatic. The app presents the move once and one tap with the user's two keys
   sweeps the Safe to the Olien (`05-onchain-design.md`, Migration); no second
   account kind in the app. The words come from legal review (item 19).

## Engineering

5. **Upgradeable by default or frozen by default for consumer accounts?** Settled
   2026-09-04: upgradeable. Consumer accounts are created changeable behind the
   24-hour lock with the veto in the user's hand, the same as treasuries, and the
   app never freezes one on its own. The trade accepted: a changeable account
   trusts that two keys, 24 hours and a veto are enough of a lock; a frozen one
   cannot take a fix and must sweep (`07-security-model.md`, Contract bug).
   Freezing stays a setting; the factory's `Init` has no freeze flag, so it is a
   first-epoch config call the app sends only when asked.
6. **Should `vetoThreshold` have an explicit override at all?** Settled by the
   review and confirmed as engineering's call on 2026-09-04 (spec §7.4, §7.5,
   §8.3): kept, but bounded. Consumer accounts leave it automatic; the console
   shows it under advanced settings with the explanation below. An explicit value must not
   exceed the number of VETO signers; the automatic value is `max(1,
   approverVetoerCount - threshold + 1)` over signers holding both APPROVE and
   VETO. The footgun the first draft feared is gone: on the threshold path the
   signer a change removes is `excluded` and cannot veto it, so an explicit 1
   gives one signer a brake on every scheduled change but no lock on its own
   removal, and a leaked key in a 2-of-2 cannot stall the quorum removing it. What
   remains is interface: the client explains what a value of 1 means before a
   treasury sets it.
7. **WebAuthn origin and rpId checks.** Settled (spec §5.2): unchecked on purpose.
   The contract rebuilds the client data JSON around the type and the challenge
   and compares nothing else in it; `rpIdHash`, origin and the counter are the
   relying party's job, bound at registration and enforced by the platform at
   every assertion, and a public verifier cannot know which origin is right.
   Coinbase Smart Wallet and Safe's passkey signer make the same choice. A
   per-signer `rpIdHash` would also cost a storage word and code the account
   cannot spare (item 23).
8. **A hook slot in v1.1?** Settled for v1: modules, hooks and guards are out
   (spec §17, item 20), for code size as much as for surface. A pre-execution hook
   (a compliance screen, a cumulative daily cap across paths) or an executor
   interface would be enabled through the config path in a later implementation.
   Decide after the first treasuries say what they need; it cannot go into v1
   without removing something (item 23).
9. **Relay or user operations for team executions?** Settled 2026-09-04
   (engineering's call): `execute` from the relayer for treasuries, user
   operations for consumer accounts, both indexed the same way. Treasuries have
   many signers and no reason to hold gas, and the relayer is a cost we bill;
   consumer accounts pay their own gas from USDC and need no key of ours. What the
   review settled: neither way depends on a bundler, since any EOA can call
   `handleOps`; and no signed meta-transaction shape is needed for single-signer
   actions (item 22). Phase 2 still measures failure modes under load; the result
   that would matter is the relayer falling behind a queue, and the answer to that
   is more relayer keys, not user operations.
10. **Simulation.** Settled 2026-09-03. Neither public RPC offers `debug_traceCall`
    (drpc: paid plan only; official: unsupported). drpc does answer `eth_simulateV1`
    and both accept `eth_call` state overrides, so simulation is `eth_simulateV1`
    with `traceTransfers` for balance deltas where available, and `eth_call` with
    decoded intent labelled "expected" elsewhere. See `06-algorithms.md` §11.
11. **P-256 signers cost 7k, resolved.** The first draft's concern, about 44k gas
    more per nested Recourse signature through `P256Owner`, is gone: a P256 signer
    is one precompile call (about 6,900 gas measured, `02-arc-facts.md`). Nested
    accounts still cost one external call; spec §16 measures 88k in forge for an
    outer 2-of-2 whose one signer is a 2-of-2 Olien, the same as the suite's
    median for a plain 2-of-2; Arc's number is pending.
12. **Address book verification.** Who vouches that an address is a supplier?
    Settled 2026-09-04 (engineering's call): two members confirm a new address,
    and the first payment to it is capped by policy.
13. **On-chain expiry for approvals.** Settled by the spec and tightened by the
    review: `validUntil` is in the hash, the contract refuses the transaction
    after it, requires it to be set, and caps it at 30 days (`MAX_VALIDITY`, spec
    §6.1), so no proposal is open-ended. The service default stays 7 days.

## Chain

14. **Mainnet.** Settled: public on 2026-09-16, chain id 5042. Day-one job now:
    verify the Arachnid CREATE2 proxy and EntryPoint v0.7 by code size on 5042;
    deploy nothing that holds money; the consumer app stays on Safe, whose canonical
    addresses are registered for 5042. Open: whether Pimlico's bundler and drpc
    cover mainnet at launch; `execute` and a direct `handleOps` need neither. The
    five Olien contracts sit at fixed CREATE2 addresses on testnet since
    2026-09-04 (`02-arc-facts.md`), so the mainnet deployment is the same script
    and the same addresses (spec §18).
15. **Blocklist behaviour.** USDC transfers to a blocklisted address revert at
    runtime. A payroll batch with one blocked recipient fails whole. Settled: the
    token exposes `isBlacklisted(address)` on Arc (checked 2026-09-03), so the
    service pre-checks every recipient and splits the batch before proposing.
16. **Privacy features.** Arc's opt-in confidential transfers, if they ship, change
    what the ledger can show to viewers versus members. Track, do not design for yet.

## Business

17. **Audit vendor and budget.** Which firm or contest, at what price, funded how.
    Squads used Trail of Bits, Neodyme, OtterSec and Certora (`01-landscape.md`);
    the five contracts here are `Olien` at about a thousand lines plus the
    verifier, factory, proxy and sub-account, and two libraries
    (`05-onchain-design.md`); the adversarial review of the draft spec (spec §19)
    is not an audit of the code. Research: three quotes, and whether the Circle grant's
    milestone shape can carry it (`08-roadmap-and-grants.md`). Settle before Phase 3
    ends so Phase 4 starts without waiting. Engineering's recommendation
    (2026-09-04): a fixed-scope review by one firm of `Olien` and `OlienVerifier`
    first, the two contracts that hold the logic, about 1,200 lines together, then
    a public contest over the whole set if the grant carries it; the firm's report
    is the milestone. The vendor and the price stay open until quotes exist.
18. **Grant timing.** Which program is open when the testnet proofs exist; see
    `08-roadmap-and-grants.md`.
19. **Custody language.** "Non-custodial" is true for treasuries and mostly true for
    consumer accounts (one of three signers is a RECOVER key sealed by Recourse,
    which cannot spend). Legal review of the exact words before a public page.

## Settled by the review and the build (2026-09-04)

20. **Modules.** Out of v1 (spec §17): no `enableModule`, no executor path, no
    module events. The built-in policies cover the product; a later implementation
    can add an executor interface through the config path. Removed rather than
    fenced, for code size.
21. **Veto scope.** A veto applies to scheduled changes only; a pending transaction
    with harvested approvals is killed by the threshold's `cancel`, immediate, or
    dies at its `validUntil` (spec §8.3, §8.4). The first draft let a veto reach
    any hash, which let a vetoer block its own removal forever.
22. **Meta-transactions for single-signer actions.** Not needed. `approve`, `veto`
    and `spend` take no signer argument: the signer is whoever calls, from its own
    address or as the account itself inside a user operation validated for that
    one signer, and any relayer submits those through `handleOps` (spec §10, §11,
    §17).
23. **Code size.** Open, and a constraint on every other item: the account is
    24,545 bytes through the IR pipeline, about 30 bytes under the EIP-170 limit
    (spec §2). Any v1 addition must remove something; the verifier already lives
    outside the account for this reason. Weigh this before promising a feature.
24. **Consumer recovery delays.** Engineering's call, 2026-09-04: consumer accounts
    are created with `recoveryCoSignDelay` of one hour (`recoveryDelay` stays 24
    hours). The co-signed path is the one a stolen cloud key plus a stolen mailbox
    would take, and an hour is enough for the phone to see the `Scheduled` event
    and veto with Face ID, while a real lost-phone restore waits an hour with the
    balance on screen. Zero would keep today's instant restore at the price of
    that attack. An account can still set zero through the config path, behind the
    24-hour lock; the app does not offer it (`05-onchain-design.md`, Consumer
    account; `07-security-model.md`, Delay windows).
