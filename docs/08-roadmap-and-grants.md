# Roadmap and grants

Phases sized for one engineer with the code that exists today. Each phase ends with
something a reviewer can use. The calendar has one fixed point: **Arc mainnet opens
on 2026-09-16**, thirteen days after this was written.

## Phase 0: what exists (done 2026-09-03)

- Canonical Safe on Arc verified; 2-of-3 Safes with a Secure Enclave owner running.
- Backend deploys Safes and relays owner swaps; sealed recovery keys; emailed codes.
- Swift: Safe hashing, signature packing, bundler client, Safe as the app's signer.
- Nested Safe signatures proven: a consumer account can be a treasury member.
- Simulation path settled (`eth_simulateV1` on drpc, state overrides everywhere).

## Phase 1: the queue (about 3 weeks, straddles mainnet launch)

The transaction service and the web console, treasuries with EOA and hardware members.

- Migration: `treasuries`, `treasury_members`, `proposals`, `confirmations`,
  `ledger_entries`, `address_book` (`04-architecture.md`).
- Routes: create treasury, propose, confirm, execute (relay), cancel, list.
- Indexer: Safe events, USDC and EURC transfers, nonce reconciliation, replaced and
  stale proposals, expiry.
- Relayer: `execTransaction` with native refund; balance alarm.
- Web: treasuries list, treasury home, new payment, proposal with decoded intent,
  simulation and `safeTxHash`, ledger with labels and CSV.
- **Mainnet day (09-16):** verify canonical addresses on 5042, deploy
  `P256OwnerFactory` with the same salt, switch the address book, run one real
  treasury with a cent.
- Exit: three people on three laptops run a 2-of-3 on mainnet end to end; a hardware
  wallet confirms the hash it shows equals the one on screen.

## Phase 2: members that are people (about 2 weeks)

- iOS: team queue, approve with Face ID as a nested signature, push on new proposals.
- Backend: contract-signature verification for confirmations; @handle invites.
- Exit: a treasury with two Recourse accounts and one hardware wallet pays a
  contractor's invoice.

## Phase 3: rules (about 3 weeks)

- Deploy Allowance module, Zodiac Delay and ModuleProxyFactory at canonical addresses;
  pin bytecode hashes.
- Rules screen: members and threshold through the Delay; allowances; approval tiers
  and known-destination policy (soft); labels "On-chain rule" / "Treasury policy".
- Exit: a member spends under an allowance with one signature; an owner change waits
  24 hours and is cancelled from another device.

## Phase 4: payroll and payables (about 3 weeks)

- Payroll runs: template, schedule, MultiSend batch, blocklist pre-check.
- Cheques from the treasury (EIP-3009 as a Safe), invoices approved by the treasury,
  a payment reference in every transfer so accounting tools reconcile by event.
- Exports (value-only CSV for parity with Safe, full ledger with labels), API keys
  with `read` and `propose` scopes.
- Exit: a monthly run pays five recipients in one approval; one is paid by cheque and
  cashes it from the consumer app.

## Phase 5: hardening (ongoing)

- Third-party review of `P256Owner` and, if used, `TreasuryGuard`.
- Second RPC for execution-gating reads; explorer cross-check.
- Static, verifiable build of the web client; pinned third-party scripts.
- Optional: Safe transaction-service API compatibility so Safe{Wallet} can point at
  this service if Safe lists the chain.

Total to a product with rules and payroll: about 11 weeks, with the consumer app
continuing to ship on the same rails.

## What a reviewer sees at each phase

| After phase | Demonstrable claim |
| --- | --- |
| 1 | The first multi-signature treasury product on Arc mainnet, on canonical Safe, gas in USDC |
| 2 | The only one whose members can be consumers with no seed phrase |
| 3 | On-chain spending limits and time locks on Arc |
| 4 | Payroll on Arc with pull-based payables that only USDC can do |

## Grants and programs

Verified 2026-09-03 with sources; amounts as published.

| Program | Fit | Facts |
| --- | --- | --- |
| **Circle Developer Grants** (relaunched 2026-05-14) | direct | 5k to 100k USDC, milestone-based; six focus areas include **treasury management** and stablecoin FX; technical review involves Circle Ventures; spotlighted grantees Hurupay and Blockradar. circle.com/grant; community.arc.io announcement |
| **ARC ecosystem allocation** | later | the ARC whitepaper (May 2026) reserves 60 percent of a 10B supply for ecosystem, explicitly including developer grants; schedule not announced |
| **Arc hackathons and accelerator** | timing | HackMoney 2026 had an Arc track titled "Build Global Payouts and Treasury Systems with USDC on Arc" (10k USDC, 155 teams; winner ArcFlow, a payroll treasury); Encode "Programmable Money" ran July 13 to August 22 with an 8-week accelerator for up to 8 teams; lablab Agentic Commerce (January) 50k USDC. arc.io blog, community.arc.io events |
| **Circle Alliance Program** | after launch | partner directory; requires a live product on Circle's platform |
| **Safe Ecosystem Foundation grants** | plausible | rolling email proposals, milestone-paid; wave 1 about 500k EUR across 21 teams; no explicit chain-expansion category found. safefoundation.org/grants |
| **Arc House / Architects** | community | points-based tiers, not applications |

Not found: grant programs at Pimlico, ZeroDev or Rhinestone; any Solana Foundation
grant to Squads (their money was venture: 1.5M, 5M, 5.7M, 10M, 18M USD, 42.9M total);
Den raised a 2.8M USD seed (IDEO CoLab, Gnosis, 2023) for a Safe interface.

**The ask, in the shape the treasury-management focus area wants:** infrastructure
the chain lacks (a transaction service and treasury tooling on canonical Safe) plus a
product with users, on mainnet, with the consumer app as the member on-ramp. Apply
after phase 1 lands on mainnet, with the reviewer table above as the milestone plan.

## Market signals worth quoting

- Arc's stated customers are fintechs, payment companies and institutions; the
  testnet cohort included Fireblocks, BitGo, Copper, Taurus and Zodia as custodians,
  Brex, Ramp, Corpay, dLocal, Nuvei and Paysafe as payment companies; day-one mainnet
  names include Fireblocks, BNY, Ledger, MetaMask, Kraken, Rain (cards), Thunes,
  Wirex, Aave, Morpho, Uniswap and BlackRock BUIDL.
- The closest existing competitor is Bron, a non-custodial team wallet listing Arc
  among 19 chains at 16, 166 and 1,666 USD a month plus swap fees. Circle's own "Arc
  Fintech Starter" treasury console uses developer-controlled MPC wallets with no
  multi-approver control. Neither is a Safe or Squads.
- Arc's ecosystem page lists no Safe, Squads, Coinshift, Request Finance, Rise,
  Toku, Franklin, Bitwave or Den.
- Pricing anchors: Squads 49 USD a month; Request Finance 42 to 1,040 USD a month
  with free stablecoin payouts and 0.5 percent on bank payouts; Rise 49 USD per
  contractor a month; Fireblocks from 699 USD a month; Circle Wallets from 0.05 USD
  per monthly active wallet.
- Circle Gateway charges 0.5 basis points on-chain; StableFX charges Circle's own
  taker and maker fees and requires individually owned wallets, which a per-team
  Safe satisfies.

## Positioning

Non-custodial is a regulatory position, not only a security one. FinCEN's 2019
guidance (section 4.2.2) says a provider whose role is limited to creating unhosted
wallets that require adding a second authorization key to the owner's key is not a
money transmitter; the GENIUS Act's definitions exclude persons solely providing
software for a customer's own custody. Squads' language ("you own it", "does not hold
customer funds") is the template. The consumer account's sealed Recovery Key is the
one place the words need care, and it cannot spend.
