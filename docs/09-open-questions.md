# Open questions

What is not decided, and what would change the design if the answer goes the other
way. Each has an owner (you, unless it says research) and a way to settle it.

## Product

1. **Safe{Wallet} compatibility or our own client first?** Half settled: Safe's
   process is public (a form, a scoring framework, quarterly rollouts, two RPC
   providers, a hosted service) and third-party hosting is normal (Protofire runs it
   for 120 networks). Our service mirrors the proposal and confirmation API, so both
   paths stay open. What remains is whether to spend the hosting effort before or
   after our own client has users; the draft says after.
2. **Who is the first customer?** A team on Arc testnet today, or the consumer app's
   own users forming teams? Settle by three conversations with Arc pilot teams once
   the market research names them.
3. **Payroll first or approvals first?** Payroll is the revenue story; approvals are
   the safety story every customer needs before payroll. The draft order is
   approvals, then payroll, then invoices.

## Engineering

4. **Relay or user operations for team executions?** Relay is simpler for a queue
   with many signers and needs no bundler dependency; user operations need no relayer
   key of ours. Draft: relay for treasuries, user operations for consumer accounts,
   both indexed the same way. Settle by measuring failure modes on testnet under load.
5. **Simulation.** Settled 2026-09-03. Neither public RPC offers `debug_traceCall`
   (drpc: paid plan only; official: unsupported). drpc does answer `eth_simulateV1`
   and both accept `eth_call` state overrides, so simulation is `eth_simulateV1`
   with `traceTransfers` for balance deltas where available, and `eth_call` with
   decoded intent labelled "expected" elsewhere. See `06-algorithms.md` §11.
6. **Contract signatures and gas caps.** A treasury of several Recourse accounts pays
   about 44k gas more per nested signature. At 25 gwei that is a cent; if mainnet gas
   is much higher it changes the tier recommendations, not the design.
7. **Delay module and the 4337 module together.** A Safe with both must route owner
   changes through the Delay and everything else directly. The consumer account
   currently has no Delay; adding one is a settings change through the threshold.
   Settle with a testnet run of the full combination.
8. **Address book verification.** Who vouches that an address is a supplier? Draft:
   two members confirm a new address, and the first payment to it is capped by
   policy.

8b. **On-chain expiry for approvals.** Safe 1.4.1 transactions carry no deadline, so
   a signature is good until the nonce moves. Service-side expiry covers the common
   case; a hard version means routing transfers through a small executor contract
   that checks a deadline in the calldata, or waiting for a Safe release with
   expiring signatures. Decide after phase 3, with data on how long approvals sit.

## Chain

9. **Mainnet.** Settled: public on 2026-09-16, chain id 5042, canonical Safe
   already registered for it. Day-one job: verify code sizes at the canonical
   addresses, deploy the absent modules and our factory with the same salts, point
   the address book at 5042. Open: whether Pimlico's bundler and drpc cover mainnet
   at launch; the relay path needs neither.
10. **Blocklist behaviour.** USDC transfers to a blocklisted address revert at
    runtime. A payroll batch with one blocked recipient fails whole. Settled: the
    token exposes `isBlacklisted(address)` on Arc (checked 2026-09-03), so the service
    pre-checks every recipient and splits the batch before proposing.
11. **Privacy features.** Arc's opt-in confidential transfers, if they ship, change
    what the ledger can show to viewers versus members. Track, do not design for yet.

## Business

12. **Grant timing.** Which program is open when the testnet product exists; see
    `08-roadmap-and-grants.md` once the research is in.
13. **Custody language.** "Non-custodial" is true for treasuries and mostly true for
    consumer accounts (one of three keys sealed by Recourse). Legal review of the
    exact words before a public page.
