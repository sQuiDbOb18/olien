# Treasury on Arc: research and engineering design

The team multisig product Arc does not have, and the account protocol under it.
Ethereum has Safe, Solana has Squads; Arc has Safe's contracts and nobody running
anything on them. This folder is the research behind building that product, and
the design of it: since 2026-09-04, an own account contract with the service and
the clients on top, rather than a product on Safe.

Names in these documents: **Olien** is the account protocol, chosen on 2026-09-04
and final; it is the string `Olien` in the EIP-712 domain of every signature, so it
cannot change without a new deployment. **Treasury** is still a working name for
the product on top.

Started 2026-09-03, the day the consumer app moved to a 2-of-3 Safe
(`../keys-and-recovery.md`). That work is the seed: a backend that deploys Safes and
relays owner changes, Swift that hashes and packs Safe signatures, a Secure Enclave
owner contract, and a bundler path with USDC as gas. What survives of it is listed
in `05-onchain-design.md`.

## Reading order

| File | What it settles |
| --- | --- |
| `01-landscape.md` | What Squads, Safe and the treasury products on top of them actually do, with sources |
| `02-arc-facts.md` | Everything verified on Arc itself: contracts, precompiles, gas, bundlers, what is missing; the Safe baseline Olien is measured against |
| `03-product.md` | Who it is for, what it does, what it deliberately does not do |
| `04-architecture.md` | The system: services, data model, APIs, how signatures travel between devices |
| `05-onchain-design.md` | The decision to build an own account: why, what it costs, what is borrowed, what survives from the Safe build, migration |
| `06-algorithms.md` | The exact procedures: hashing, packing, the queue, policy evaluation, gas on Arc, indexing |
| `07-security-model.md` | Threats, invariants, what a compromise of each part yields, contract risk |
| `08-roadmap-and-grants.md` | Phases, effort, and the programs that fund this category |
| `09-open-questions.md` | What is undecided and what would change the design |
| `10-account-spec.md` | The contract, normatively: paths, signers, hashes, signatures, scheduling, limits, recovery, ERC-4337, events, invariants, gas targets |

## Status (2026-09-04)

Decision: the product is built on its own account protocol rather than on Safe
(`05-onchain-design.md`). The specification (`10-account-spec.md`) was drafted in
the morning, reviewed adversarially (26 findings, spec §19), and the contracts
were written against the fixed version, reviewed, tested and deployed to Arc
testnet the same day: `OlienVerifier`, the `SubAccount` implementation, the
`Olien` v1 implementation and `OlienFactory`, through the Arachnid CREATE2
proxy at fixed salts (addresses and transactions in the proofs table of
`02-arc-facts.md`; `08-roadmap-and-grants.md` Phase 1). 61 Olien tests plus 58
other tests pass (119). Proofs by transaction landed the same evening (an account
created, a P-256 execution, a spend under a limit, a guardian's recovery vetoed by
the device through a user operation, a threshold user operation paid in USDC, a
nested signature): spec §16 has the measured gas and §18 the transactions. That
evening the name became Olien, the four contracts were deployed again under it
(the name is in every hash) and the proofs repeated on the new addresses; the
product questions in `09-open-questions.md` items 1 to 5 were answered and the
engineering ones decided. Nothing is on mainnet. The consumer app runs on Safe
until the review in `08-roadmap-and-grants.md` Phase 4 lands.

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
