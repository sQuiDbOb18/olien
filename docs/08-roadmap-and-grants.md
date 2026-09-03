# Roadmap and grants

Phases sized for one engineer with the code that exists today. Each phase ends with
something a reviewer can use on testnet. The grants section is filled from the market
research as it lands; the phases do not depend on it.

## Phase 0: what exists (done 2026-09-03)

- Canonical Safe on Arc verified; 2-of-3 Safes with a Secure Enclave owner running.
- Backend deploys Safes and relays owner swaps; sealed recovery keys; emailed codes.
- Swift: Safe hashing, signature packing, bundler client, Safe as the app's signer.
- Nested Safe signatures proven: a consumer account can be a treasury member.
- Simulation path settled (`eth_simulateV1` on drpc, state overrides everywhere).

## Phase 1: the queue (about 3 weeks)

The transaction service and the web console, treasuries with EOA and hardware members.

- Migration: `treasuries`, `treasury_members`, `proposals`, `confirmations`,
  `ledger_entries`, `address_book` (`04-architecture.md`).
- Routes: create treasury, propose, confirm, execute (relay), cancel, list.
- Indexer: Safe events, USDC and EURC transfers, nonce reconciliation, replaced
  proposals.
- Relayer: `execTransaction` with native refund; balance alarm.
- Web: treasuries list, treasury home, new payment, proposal with decoded intent,
  simulation and `safeTxHash`, ledger with labels and CSV.
- Exit: three people on three laptops run a 2-of-3 on testnet end to end; a hardware
  wallet confirms the hash it shows equals the one on screen.

## Phase 2: members that are people (about 2 weeks)

- iOS: team queue, approve with Face ID as a nested signature, push on new proposals.
- Backend: contract-signature verification for confirmations; @handle invites.
- Exit: a treasury with two Recourse accounts and one hardware wallet pays a
  contractor's invoice.

## Phase 3: rules (about 3 weeks)

- Deploy Allowance module, Zodiac Delay and ModuleProxyFactory at canonical addresses
  on testnet; pin bytecode hashes.
- Rules screen: members and threshold through the Delay; allowances; approval tiers
  and known-destination policy (soft); labels "On-chain rule" / "Treasury policy".
- Exit: a member spends under an allowance with one signature; an owner change waits
  24 hours and is cancelled from another device.

## Phase 4: payroll and payables (about 3 weeks)

- Payroll runs: template, schedule, MultiSend batch, blocklist pre-check.
- Cheques from the treasury (EIP-3009 as a Safe), invoices approved by the treasury.
- Exports, API keys with `read` and `propose` scopes.
- Exit: a monthly run pays five recipients in one approval; one is paid by cheque and
  cashes it from the consumer app.

## Phase 5: hardening and mainnet readiness (ongoing)

- Third-party review of `P256Owner` and, if used, `TreasuryGuard`.
- Second RPC for execution-gating reads; explorer cross-check.
- Deploy script for mainnet with bytecode verification; dry run on testnet from a
  clean state.
- Optional: Safe transaction-service API compatibility so Safe{Wallet} can point at
  this service if Safe lists the chain.

Total to a testnet product with rules and payroll: about 11 weeks of build, with
the consumer app continuing to ship on the same rails.

## What a grant reviewer sees at each phase

| After phase | Demonstrable claim |
| --- | --- |
| 1 | The first multi-signature treasury product on Arc, on canonical Safe, gas in USDC |
| 2 | The only one whose members can be consumers with no seed phrase |
| 3 | On-chain spending limits and time locks on Arc |
| 4 | Payroll on Arc with pull-based payables that only USDC can do |

## Grants and programs

Filled from `01-landscape.md` once the research lands. The shape of the ask is known
already: infrastructure the chain lacks (a transaction service and treasury
tooling for Safe on Arc) plus a product with users, which is the profile both
chain-ecosystem programs and Safe's own expansion grants have funded elsewhere.
