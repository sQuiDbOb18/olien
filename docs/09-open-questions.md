# Open questions

What is not decided, and what would change the design if the answer goes the other
way. Each has an owner (you, unless it says research) and a way to settle it. Items
the 2026-09-04 decision, the review of the draft spec (spec §19) and the contract
settled are marked so and kept short; the Safe-only items of the first draft
(Safe{Wallet} hosting, the Delay and 4337 modules together) are gone with it.

## Product

1. **The name.** Concord is a placeholder, and it is in the EIP-712 domain (spec
   §4), so every hash changes with it. It must be final before any deployment whose
   signatures have to survive: before mainnet without question, and before the
   Phase 1 testnet deployment if its proofs are to stay valid. Settle before Phase 1
   ends; a trademark search is part of it. The 2026-09-04 testnet deployment
   carries the placeholder; a rename changes the implementation's bytecode and so
   its CREATE2 address, which means a new deployment and repeated proofs.
2. **Who is the first customer?** A team on Arc testnet today, or the consumer app's
   own users forming teams? Settle by three conversations with Arc pilot teams once
   the market research names them.
3. **Payroll first or approvals first?** Payroll is the revenue story; approvals are
   the safety story every customer needs before payroll. The order in
   `08-roadmap-and-grants.md` is approvals, then payroll, then invoices.
4. **Consumer migration on mainnet: opt-in or automatic?** Automatic means the app
   sweeps every Safe to its Concord after Phase 4 with the user's two keys in one
   tap; opt-in means two account kinds in the app for a while. Automatic is simpler
   to support and harder to explain. Settle before Phase 5 with the words legal
   review approves (item 19).

## Engineering

5. **Upgradeable by default or frozen by default for consumer accounts?**
   `05-onchain-design.md` says changeable behind the lock, with the veto in the
   user's hand. The trade: a frozen account cannot take a fix and must sweep; a
   changeable one trusts that two keys, 24 hours and a veto are enough of a lock.
   Treasuries choose in settings. The factory's `Init` has no freeze flag, so
   freezing is a first-epoch config call the app would send. Settle before Phase 3
   creates real consumer Concords.
6. **Should `vetoThreshold` have an explicit override at all?** Settled by the
   review (spec §7.4, §7.5, §8.3): kept, but bounded. An explicit value must not
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
9. **Relay or user operations for team executions?** `execute` from the relayer is
   simpler for a queue with many signers and needs no bundler; user operations need
   no relayer key of ours and let the account pay. Draft: `execute` for treasuries,
   user operations for consumer accounts, both indexed the same way. Settle by
   measuring failure modes on testnet under load. What the review settled: neither
   way depends on a bundler, since any EOA can call `handleOps`; and no signed
   meta-transaction shape is needed for single-signer actions (item 22).
10. **Simulation.** Settled 2026-09-03. Neither public RPC offers `debug_traceCall`
    (drpc: paid plan only; official: unsupported). drpc does answer `eth_simulateV1`
    and both accept `eth_call` state overrides, so simulation is `eth_simulateV1`
    with `traceTransfers` for balance deltas where available, and `eth_call` with
    decoded intent labelled "expected" elsewhere. See `06-algorithms.md` §11.
11. **P-256 signers cost 7k, resolved.** The first draft's concern, about 44k gas
    more per nested Recourse signature through `P256Owner`, is gone: a P256 signer
    is one precompile call (about 6,900 gas measured, `02-arc-facts.md`). Nested
    accounts still cost one external call; spec §16 measures 88k in forge for an
    outer 2-of-2 whose one signer is a 2-of-2 Concord, the same as the suite's
    median for a plain 2-of-2; Arc's number is pending.
12. **Address book verification.** Who vouches that an address is a supplier? Draft:
    two members confirm a new address, and the first payment to it is capped by
    policy.
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
    five Concord contracts sit at fixed CREATE2 addresses on testnet since
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
    the five contracts here are `Concord` at about a thousand lines plus the
    verifier, factory, proxy and sub-account, and two libraries
    (`05-onchain-design.md`); the adversarial review of the draft spec (spec §19)
    is not an audit of the code. Research: three quotes, and whether the Circle grant's
    milestone shape can carry it (`08-roadmap-and-grants.md`). Settle before Phase 3
    ends so Phase 4 starts without waiting.
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
