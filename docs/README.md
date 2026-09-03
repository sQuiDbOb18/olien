# Treasury on Arc: research and engineering design

The team multisig product Arc does not have. Ethereum has Safe, Solana has Squads;
Arc has Safe's contracts and nobody running anything on them. This folder is the
research behind building that product, and the design of it.

Working name in these documents: **Treasury**. Not a brand; a placeholder.

Started 2026-09-03, the day the consumer app moved to a 2-of-3 Safe
(`../keys-and-recovery.md`). That work is the seed: a backend that deploys Safes and
relays owner changes, Swift that hashes and packs Safe signatures, a Secure Enclave
owner contract, and a bundler path with USDC as gas.

## Reading order

| File | What it settles |
| --- | --- |
| `01-landscape.md` | What Squads, Safe and the treasury products on top of them actually do, with sources |
| `02-arc-facts.md` | Everything verified on Arc itself: contracts, precompiles, gas, bundlers, what is missing |
| `03-product.md` | Who it is for, what it does, what it deliberately does not do |
| `04-architecture.md` | The system: services, data model, APIs, how signatures travel between devices |
| `05-onchain-design.md` | Contracts and modules: what exists, what to deploy, what to write, how nested accounts sign |
| `06-algorithms.md` | The exact procedures: hashing, packing, the nonce queue, policy evaluation, gas on Arc, indexing |
| `07-security-model.md` | Threats, invariants, what a compromise of each part yields |
| `08-roadmap-and-grants.md` | Phases, effort, and the programs that fund this category |
| `09-open-questions.md` | What is undecided and what would change the design |

## Status (2026-09-03)

Research complete. Every on-chain claim in
`02-arc-facts.md` is backed by a transaction or a code read on Arc testnet. The
market, grants, policy-engine, payroll, invoicing and incident sections come from
primary sources fetched the same day; each carries its URL or document name.

Two dates set the pace: Arc mainnet opens on 2026-09-16, and Circle's developer
grants (5k to 100k USDC, "treasury management" is a named focus) are open now.

## Rules for this folder

- A claim about a chain is accompanied by how it was checked (a transaction hash, an
  `eth_getCode` result, a document URL). Unverified claims are marked as such.
- Designs name the code that already exists in this repository when they build on it.
- No em dashes.
