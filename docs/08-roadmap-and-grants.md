# Roadmap and grants

Phases sized for one engineer with the code that exists today. Each phase ends with
something a reviewer can use. The calendar has one fixed point: **Arc mainnet opens
on 2026-09-16**, twelve days after the decision below. The account contract comes
first now, because everything else is built on it (`05-onchain-design.md`).

## Phase 0: what exists (done 2026-09-03)

- Canonical Safe on Arc verified; 2-of-3 Safes with a Secure Enclave owner running.
- Backend deploys Safes and relays owner swaps; sealed recovery keys; emailed codes.
- Swift: Safe hashing, signature packing, bundler client, Safe as the app's signer.
- Nested Safe signatures proven: a consumer account can be a treasury member.
- Simulation path settled (`eth_simulateV1` on drpc, state overrides everywhere).
- Research: landscape, Arc facts, policy engines, payroll, grants (`01`, `02`, this
  file).
- **2026-09-04: decision to build the own account; spec written, reviewed
  adversarially (26 findings, spec §19), contracts built and on testnet**
  (`10-account-spec.md`, `05-onchain-design.md`, Phase 1 below). That evening:
  named Olien, deployed again under the name, proofs repeated; the product
  questions answered (`09-open-questions.md` items 1 to 5).

## Phase 1: the account (about 2 to 3 weeks; contracts done on day one)

Status, 2026-09-04: contracts written, reviewed, tested and deployed to testnet;
proofs by transaction landed the same evening, then again on the deployment under
the final name: see `10-account-spec.md` §18.

`Olien`, `OlienProxy`, `OlienFactory`, `OlienVerifier`, `SubAccount`, in
Foundry, against the real EntryPoint v0.7 bytecode.

- Contracts: the spec, section by section, in `contracts/src/olien/`; the draft
  spec was reviewed adversarially before any code and the review's fixes are the
  contract (spec §19). OpenZeppelin 5.1.0, pinned by commit, for the proxy,
  CREATE2, clones and the Solidity P-256 fallback; the WebAuthn envelope and the
  EIP-712 hashing are our own libraries. The account is 24,545 bytes through the
  IR pipeline, about 30 bytes under the limit, which is why the P-256 and
  passkey checks live in a separate verifier. Done.
- Tests: 61 Olien tests in three files (`OlienAccount.t.sol`,
  `OlienPolicies.t.sol`, `Olien4337.t.sol`) plus 58 other tests pass (119),
  against the real EntryPoint; where a P-256 signature is involved the suite has
  Daimo's Solidity verifier standing in for the precompile. Gas as measured in
  forge is in spec §16 (`execute` with one transfer and two ECDSA entries 88k at
  the suite's median; `spend` 33k; `veto` 34k; the P-256 rows carry the stand-in's
  cost). Done.
- Testnet deployment through the Arachnid CREATE2 proxy with fixed salts, on
  2026-09-04 (transactions and gas in `02-arc-facts.md`, proofs table):
  `OlienVerifier` `0xE196558Ce080229B256dDE6e62CDA2B051B882fC`, `SubAccount`
  implementation `0xDfc576536187eF72689c514f8c7ea6487960a637`, `Olien` v1
  implementation `0x8BFf8CCe4edbE882a21197D3942978CCd06fA427`, `OlienFactory`
  `0xaF8c108D09E6A159D4dcE0919Ca6A81d6019f131`, deployed again that evening under the final
  name (the name is in every hash). Done; spec §18 has the table.
- A proof transaction set on testnet, recorded in spec §18 the way `02-arc-facts.md`
  records the Safe ones: create an account; execute a 2-of-2 with one P-256 signer;
  spend under a limit with a key that has no permission bits; a scheduled change
  vetoed; a user operation paid from the account's USDC; a nested account signing
  for an outer one. Done the same evening; spec §16 carries the Arc figures.
- **Mainnet day (09-16), inside this phase:** verify by code size that the Arachnid
  CREATE2 proxy and EntryPoint v0.7 exist on 5042; deploy nothing that holds money.
  The consumer app stays on Safe on mainnet (its canonical addresses are registered
  for 5042, `02-arc-facts.md`) until Phase 4 ends.
- Exit: the six proofs above on testnet, with Arc's measured gas in the spec §16
  table.

## Phase 2: the service and console (about 3 weeks)

The transaction service and the web console on Olien, with ECDSA and WebAuthn
members. Status, evening of 2026-09-04: built and run end to end on testnet from
one machine; what is left is listed under each item.

- Migration: `olien_accounts`, `olien_signers`, `olien_proposals`,
  `olien_confirmations`, `olien_vetoes`, `olien_spending_limits`,
  `olien_sub_accounts`, `olien_ledger`, `olien_address_book`, `olien_lanes`,
  `treasury_linked_addresses` (`backend/migrations/0013_treasury.sql`). Done.
- Routes (`11-service-api.md`): link an address, create account, propose (raw calls
  and the transfer, signers, limit and remove-limit builders), confirm, execute,
  cancel, delete, scheduled changes with the veto calldata and `executeScheduled`,
  ledger, address book. Done. Not yet: sub-account creation, API keys.
- Indexer: the spec §14 events, USDC transfers, lanes from `getNonce`, replaced and
  stale proposals, limits and sub-accounts mirrored from events. Done. Not yet:
  EURC, `UserOperationEvent`, discovery of accounts the service did not create.
- Relayer: `createAccount`, `execute` and `executeScheduled` paid by us, one key
  shared with the Safe deployer (`RELAYER_PK` falls back to `ATTESTOR_PK`), the
  pending nonce read at every send. Done. Not yet: `handleOps`, the balance alarm.
- Web: accounts list, new account, account home, new payment, proposal with
  decoded calls, the hash beside the wallet's, confirm with the browser key or
  MetaMask, execute, cancel, scheduled changes with countdown and veto from the
  member's own wallet, rules editor (signers, threshold, delays), ledger and
  address book. Done. Not yet: the limits editor, CSV export, passkey members
  (the service checks P-256 and WebAuthn signatures; the console signs ECDSA only).
- Simulation: `eth_call` per call from the account at proposal time; the
  `eth_simulateV1` path with balance deltas is not wired yet.
- The first customer is a team on Arc testnet (decided 2026-09-04,
  `09-open-questions.md` item 2): one pilot team from the cohort in
  `03-product.md`, on the console before mainnet money exists, with us watching
  what they do.
- Exit: that team runs a 2-of-3 on testnet end to end from three laptops; a
  hardware wallet confirms the hash it shows equals the one on screen; a signer
  change waits 24 hours and is vetoed from another device. Not yet: the run below
  is the same flow driven by a script from one machine with three keys and two
  user sessions, against the service on a local Postgres and Arc testnet.

  Proof run, evening of 2026-09-04, account
  `0x2a5533614f50fa5ce1eaf5d26d431e48dfb43f8a` (2-of-3, rule delay 120 s):

  | Step | Transaction | Checked against |
  | --- | --- | --- |
  | Created by the relayer through `POST /accounts` | `0x2ed9b0291d4fa60959af18b85159ec8fd854ad5a7c9969e32aabf1ed469f5393` | `getConfig` on chain, epoch 1; the second user sees it through her linked key |
  | Payment of 0.05 USDC proposed, two signatures, executed by the relayer at the other user's request | `0x212a737a055a5ba5e07a81f203a636412eb25530cb174f4ab502b81d3e81c9d7` | the service's hash equals `getTransactionHash`; the payee's balance rises by exactly 50,000; a signature from the wrong key is refused |
  | Signer change (add a fourth key) executed into the time lock | `0xcaf7fc1a413812e02f433425398cf4bd82eb8c29092a977fe462279d41ba02f7` | status `scheduled`, rule text "2 vetoes stop it" (automatic threshold for a 2-of-3) |
  | Two vetoes from two members' own wallets | `0x561938b66c29c88c1e422a6dbd26de94edf3a9d6c2fe4c50e703106a9b622aa7`, `0x2143b030dfad46a5fc5380bdd8b71f48386c51536a5c9a01574ae12281e4b39c` | one veto leaves it scheduled and the veto call no longer offers that key; after the second the indexer shows `vetoed` and `isDead` is true |
  | The same change proposed again and executed after its delay by the relayer | `0xb94a168ecab85f053329068f216b5130f281c830dcbb63b6fcff86ff38c43075` | an early `executeScheduled` is refused; epoch 2 and four signers on chain and in the service; the ledger shows the two transfers with the memo |

  The console's signing guard was checked without a browser: viem's
  `hashTypedData` over the service's typed data equals the service's hash for
  all three proposals.

## Phase 3: members that are people (about 2 weeks)

- iOS: `OlienSigner` and `OlienSubmitter` beside the Safe ones; team queue;
  approve with Face ID as a nested `Message(hash)` signature; push on new proposals
  and on `Scheduled`, with a veto button.
- Backend: consumer accounts created as Oliens on testnet (device P256, cloud
  ECDSA, server RECOVER); the recovery flow as `replaceSigner` through the recovery
  path; migration of existing testnet Safes by sweep (`05-onchain-design.md`,
  Migration); @handle invites.
- Exit: a testnet treasury with two Recourse accounts and one hardware wallet pays a
  contractor's invoice; a consumer account recovers a lost phone with the cloud key
  and the email code after the one-hour co-signed delay, and a lost cloud key
  through the 24-hour path.

## Phase 4: review (3 to 6 weeks of calendar, mostly waiting)

- Third-party audit or an audit contest of the five contracts; vendor and budget are
  open (`09-open-questions.md`).
- Fixes; re-run the proofs; freeze the v1 implementation address.
- Meanwhile: second RPC for execution-gating reads; explorer cross-check; static,
  verifiable build of the web client; pinned third-party scripts.
- Exit: the report published, findings closed, the v1 address final.

## Phase 5: mainnet (about 1 week)

- Deploy the implementation and the factory at the same addresses on 5042 through
  the CREATE2 proxy; confirm the code hashes match testnet.
- Migrate consumer accounts automatically (decided 2026-09-04,
  `09-open-questions.md` item 4): the app presents the move once and one tap with
  the two keys sweeps the Safe; the sweep is one Safe transaction per account.
- First treasuries with a cent, then real ones.
- Exit: a treasury on mainnet pays a contractor from an Olien; a consumer account
  on mainnet is an Olien.

## Phase 6: payroll and payables (about 3 weeks)

- Payroll runs: template, schedule, native `Call[]` batch, payroll sub-account and
  limit, blocklist pre-check.
- Cheques from the treasury (EIP-3009 through the account's EIP-1271), invoices
  approved by the treasury, a payment reference in every transfer so accounting
  tools reconcile by event.
- Exports (value-only CSV, full ledger with labels), API keys with `read` and
  `propose` scopes.
- Exit: a monthly run pays five recipients from the payroll sub-account under a
  limit; one is paid by cheque and cashes it from the consumer app.

Total to a product with rules and payroll on mainnet: about 14 to 18 weeks, with
the consumer app continuing to ship on Safe rails until Phase 5.

## What a reviewer sees at each phase

| After phase | Demonstrable claim |
| --- | --- |
| 1 | The first multi-signature account protocol native to Arc, with P-256 signers verified by the chain's precompile, proven on testnet |
| 2 | A treasury console on it: proposals across devices, rule changes that wait and can be vetoed, spending limits, gas in USDC |
| 3 | The only one whose members can be consumers with no seed phrase, on the same contract as the team |
| 4 | Reviewed by a third party; the v1 address frozen |
| 5 | On Arc mainnet, holding money, with the consumer accounts on it |
| 6 | Payroll on Arc with pull-based payables that only USDC can do |

## Grants and programs

Verified 2026-09-03 with sources; amounts as published.

| Program | Fit | Facts |
| --- | --- | --- |
| **Circle Developer Grants** (relaunched 2026-05-14) | direct | 5k to 100k USDC, milestone-based; six focus areas include **treasury management** and stablecoin FX; technical review involves Circle Ventures; spotlighted grantees Hurupay and Blockradar. circle.com/grant; community.arc.io announcement |
| **ARC ecosystem allocation** | later | the ARC whitepaper (May 2026) reserves 60 percent of a 10B supply for ecosystem, explicitly including developer grants; schedule not announced |
| **Arc hackathons and accelerator** | timing | HackMoney 2026 had an Arc track titled "Build Global Payouts and Treasury Systems with USDC on Arc" (10k USDC, 155 teams; winner ArcFlow, a payroll treasury); Encode "Programmable Money" ran July 13 to August 22 with an 8-week accelerator for up to 8 teams; lablab Agentic Commerce (January) 50k USDC. arc.io blog, community.arc.io events |
| **Circle Alliance Program** | after launch | partner directory; requires a live product on Circle's platform |
| **Safe Ecosystem Foundation grants** | weaker since 2026-09-04: the account is no longer Safe, though an Olien can be a Safe owner | rolling email proposals, milestone-paid; wave 1 about 500k EUR across 21 teams; no explicit chain-expansion category found. safefoundation.org/grants |
| **Arc House / Architects** | community | points-based tiers, not applications |

Not found: grant programs at Pimlico, ZeroDev or Rhinestone; any Solana Foundation
grant to Squads (their money was venture: 1.5M, 5M, 5.7M, 10M, 18M USD, 42.9M total);
Den raised a 2.8M USD seed (IDEO CoLab, Gnosis, 2023) for a Safe interface.

**The ask, in the shape the treasury-management focus area wants:** account
infrastructure the chain lacks (an open-source account protocol with P-256 signers,
spending limits, time locks and recovery inside the account, plus the transaction
service and console on it), with the consumer app as the on-ramp for members. Apply
after Phase 1's proofs land on testnet, with the reviewer table above as the
milestone plan. The Phase 4 audit is a natural milestone in a milestone-based grant:
it is the gate before mainnet money, it has a deliverable (the report), and it is
the line item a grant can pay for.

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
  account satisfies.

## Positioning

Non-custodial is a regulatory position, not only a security one. FinCEN's 2019
guidance (section 4.2.2) says a provider whose role is limited to creating unhosted
wallets that require adding a second authorization key to the owner's key is not a
money transmitter; the GENIUS Act's definitions exclude persons solely providing
software for a customer's own custody. Squads' language ("you own it", "does not hold
customer funds") is the template. The consumer account's sealed Recovery Key is the
one place the words need care, and it cannot spend.
