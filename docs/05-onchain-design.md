# On-chain design

Decision, 2026-09-04: the product is built on its **own account protocol**, a peer
of Safe and Squads rather than a product on top of Safe. The specification is
`10-account-spec.md`; this document is the reasoning, the comparison, and how the
things built so far carry over.

The first draft of this folder (2026-09-03) chose canonical Safe 1.4.1 plus modules.
That draft is in git history and its research still stands (`01`, `02`), but the
design below replaces it.

## Why an own account

- **The chain has a primitive Safe cannot use.** Arc ships the RIP-7212 P-256
  precompile. A Safe can only hold addresses as owners, so a Secure Enclave key or a
  passkey costs a contract per key and 44k gas per signature through EIP-1271.
  An account that stores P-256 keys as signers verifies them for about 7k gas
  directly. On a chain whose users are phones and laptops, that is the account.
- **Policies belong inside the account.** Spending limits, a time lock on rule
  changes, recovery by a guardian, veto, approval expiry: on Safe each is a module or
  a modifier from a different repository with its own deployment, audit and
  version. Squads put them in one program and that is the design people copy. One
  contract, one audit, one address book.
- **One account for people and teams.** The consumer 2-of-3 and the team treasury
  become the same contract with different settings, so a person is a member of a
  team with a nested signature and nothing else. Safe could do this too (proven in
  `02-arc-facts.md`), but only with the P-256 detour and the pre-image dance.
- **Nobody else is on the chain.** Safe has contracts on Arc and no service, no
  wallet, no modules. There is no ecosystem to be compatible with yet. The cost of
  leaving Safe is the cost of not inheriting Safe{Wallet}, its SDK and its modules;
  on Arc today that inheritance is smaller than it sounds.
- **The product is the infrastructure.** Squads' position on Solana is the
  program plus the interface plus the service. Building the account is what makes
  the grant story "infrastructure the chain lacks" true rather than "a front end for
  Safe".

## What it costs, stated once

- **An audit before real money.** A new account contract holding a company's USDC
  is not a launch until reviewed. Plan: testnet product first, a review funded by
  the grant or by revenue, mainnet after. The consumer app keeps running on Safe
  for real money until the review lands, then migrates (§ Migration).
- **Upgradeability is a decision, not a default.** Safe accounts are proxies whose
  owners can change the implementation instantly. Squads is frozen. Concord lets each
  account choose: an implementation change is a config call behind the time lock and
  the veto, and an account can freeze itself forever. The product's default for
  treasuries is "changeable behind a 24 hour lock"; for consumer accounts,
  "changeable behind the lock, with the veto in the user's hand".
- **Safe compatibility is gone except at the edges.** A Concord can be an owner of a
  Safe (it answers the legacy 1271 overload), and a Safe can be a CONTRACT signer of
  a Concord. Nothing else is shared: no Safe SDK, no Safe{Wallet}, no Safe
  transaction-service API shape. The service design in `04-architecture.md` drops
  the Safe-shaped routes and keeps the rest.

## What is borrowed, and from where

| Idea | From | In Concord |
| --- | --- | --- |
| Members with permission bits, proposals, reject, time lock, stale index, spending limits with destinations, sub-accounts ("vaults") | Squads v4 / Smart Account Program | signers with APPROVE, VETO, RECOVER; veto; delays; epoch; limits; sub-accounts |
| Policies as consensus: a policy is an authorization path, not a separate program | Squads Smart Account Program | the five paths in spec §1, resolved inside the contract |
| Off-chain signatures packed and verified at execution, sorted by signer, on-chain `approveHash` for signers that cannot sign off-chain | Safe 1.4.1 | packed format (simpler: length-prefixed, no offsets), `approve` |
| EIP-712 for the operation the account executes, with a validity window, instead of signing the opaque `userOpHash` | Safe4337Module | `UserOperation` typed struct with `validAfter`/`validUntil`/`epoch` |
| 2D nonces so independent queues do not block each other | ERC-4337 EntryPoint | `nonceKey` in `Transaction` |
| Guardian recovery with a delay and an owner's veto; co-signing shortens the delay | Argent, Safe SocialRecoveryModule, Candide | RECOVER signer, `recoveryDelay`, `recoveryCoSignDelay`, veto |
| Scheduled changes lapse if not executed within a window | Zodiac Delay (`txExpiration`) | `SCHEDULE_WINDOW` |
| P-256 and WebAuthn signers as first-class keys | Coinbase Smart Wallet, Safe passkey signer, Daimo | kinds P256 and WEBAUTHN, precompile first |
| Namespaced storage, minimal proxy, factory as 4337 `initCode` | Kernel v3, Coinbase Smart Wallet | ERC-7201, ERC-1967, `ConcordFactory` |
| Never delegatecall; batches native to the account | the Bybit incident, Coinbase Smart Wallet | no delegatecall in the implementation; `Call[]` |

What is not borrowed: Safe's gas refund in the account (the EntryPoint does that
job on Arc, in USDC, without our code), Squads' on-chain proposal accounts as the
only way to collect approvals (both off-chain signatures and on-chain approvals
count here), weighted signers, hooks and guards (none in v1).

## The contract set

```
ConcordFactory ── CREATE2 ──> ConcordProxy (per account, ERC-1967) ── delegatecall ──> Concord v1 (implementation)
                                     │                                        │
                                     │                                        └── staticcall ──> ConcordVerifier (P-256, WebAuthn)
                                     └── CREATE2 ──> SubAccount clone (per index, EIP-1167, parent = the proxy)
```

Five contracts (spec §2), on Arc testnet since 2026-09-04 at fixed CREATE2
addresses (`02-arc-facts.md`, proofs table; spec §18):

- `Concord`: the implementation. Signers, threshold, epoch, 2D nonces, `execute`,
  `validateUserOp` and `executeUserOp`, `approve`, `veto`, `spend`,
  `executeScheduled`, the configuration functions plus the immediate `cancel` and
  `removeSpendingLimit`, EIP-1271, sub-account creation. No modules, no
  `signMessage`, no deposit helpers (spec §17; deposits and stake at the EntryPoint
  are plain calls from a threshold batch). About a thousand lines plus the
  `ConcordHash` library; 24,545 bytes of runtime code through the IR pipeline,
  about 30 bytes under the EIP-170 limit, so anything added to v1 takes something
  out.
- `ConcordProxy`: OpenZeppelin's `ERC1967Proxy`; the implementation slot is written
  by the account's own `setImplementation` and nothing else.
- `ConcordFactory`: deterministic creation, `AccountCreated(account, salt)`; the
  same address on every chain the same implementation is on.
- `ConcordVerifier`: stateless P-256 and passkey checks, outside the account for
  code size. The RIP-7212 precompile is asked first; an empty answer is checked
  against the specification vector before OpenZeppelin's Solidity verifier is
  allowed to decide (spec §5.4). The WebAuthn envelope is
  `abi.encode(authenticatorData, clientDataFields, r, s)`, with the client data
  JSON rebuilt around the challenge; origin, rpIdHash and the counter are
  unchecked on purpose (spec §5.2).
- `SubAccount`: one implementation, EIP-1167 clones per account and index;
  `execute(Call[])` and `transfer(token, to, amount)`, parent only; receivers.

Everything already built for the Safe design that survives:

| Built (2026-09-03) | Fate |
| --- | --- |
| `P256Owner`, `P256OwnerFactory` (contracts, on testnet) | kept for the Safe accounts that exist; not used by Concord, whose P256 signers need no contract |
| `SafeSigning.swift`, `SafeSubmitter.swift`, `SafeAccountSigner.swift` | kept while consumer accounts are Safes; a `ConcordSigner` and `ConcordSubmitter` sit beside them with the same protocols (`BuyerSigner`, `ArcSubmitter`) |
| `DeviceKey.swift` (Secure Enclave P-256) | unchanged; it produces exactly the 64-byte signature a P256 signer needs, with `s` normalised low |
| `BundlerClient.swift`, Pimlico path | unchanged |
| backend `safe.rs`, `smart_accounts.rs`, `recovery.rs` | the sealed Recovery Key becomes the RECOVER signer of consumer Concords; the swap logic becomes `replaceSigner` through the recovery path; the Safe deploy code stays for existing accounts |
| the treasury service design (`04`), algorithms (`06`), security model (`07`) | re-cut for Concord's hashes and paths; the queue, indexer, policy tiers and playbooks are the same shape |
| every Arc fact and market fact (`01`, `02`) | unchanged |

## Consumer account on Concord

Two signers and a guardian:

| Signer | Kind | Permissions | Where |
| --- | --- | --- | --- |
| Device Key | P256 | APPROVE, VETO | Secure Enclave, Face ID |
| Cloud Key | ECDSA | APPROVE, VETO | iCloud keychain |
| Recovery Key | ECDSA | RECOVER | sealed on the server, releases only after an emailed code |

`threshold = 2`, `vetoThreshold = 0` (automatic: 1), `configDelay = 24h`,
`recoveryDelay = 24h`, `recoveryCoSignDelay = 0`.

- Pay: device + cloud, one user operation, gas from the account's own USDC.
- New phone, cloud key present: cloud signs, the server's RECOVER key co-signs after
  the email code, `replaceSigner(oldDevice, newDevice)` runs at once (today's flow).
- New phone, cloud key lost: the RECOVER key alone schedules the replacement; it
  runs 24 hours later unless the old device vetoes. Today this case has no answer.
- Stolen cloud key plus stolen mailbox: with `recoveryCoSignDelay = 0` the
  co-signed replacement runs at once, the same trust as today's 2-of-3 Safe. An
  account that sets that delay to an hour turns this into a scheduled change the
  phone sees (the app watches `Scheduled`) and vetoes with Face ID; the product
  will offer that setting, and the default is a decision for `09-open-questions.md`.
- The server can never spend: RECOVER is not APPROVE, and `replaceSigner` cannot
  escalate permissions.

## Team treasury on Concord

Members are ECDSA (hardware wallets, browser wallets), WEBAUTHN (a laptop passkey
with `UV_REQUIRED`), or CONTRACT (a consumer Concord, another treasury, a Safe).
`threshold` as chosen, `configDelay = 24h` by default, no RECOVER signer unless the
team names one, `vetoThreshold` automatic. Spending limits name the payroll key or
a member and a destination list; a payroll sub-account holds the month's budget.

## Migration from the Safe accounts

Consumer accounts that exist today are Safes with owners [Cloud Key, `P256Owner`,
Recovery EOA]. When Concord is reviewed and on mainnet:

1. The app creates the Concord counterfactually (same device key, same cloud key,
   the server's RECOVER key), shows the new address.
2. One Safe transaction (device + cloud) sweeps USDC and EURC to the Concord; the
   `@handle` repoints (`handles::repoint` exists).
3. Cheques written by the Safe stay valid until cashed; the Safe stays deployed and
   empty; nothing is destroyed.
4. Protected-checkout evidence signing and any other place that assumed a Safe
   address moves to the Concord signer.

Treasuries created before Concord do not exist, so there is nothing to migrate.

## Audits and pinning

- `Concord`, `ConcordProxy`, `ConcordFactory`, `ConcordVerifier`, `SubAccount`:
  ours. The draft specification was reviewed adversarially before any code was
  written (26 findings, spec §19). Tests in Foundry (`contracts/test/concord/`)
  against the real EntryPoint v0.7 bytecode: 61 Concord tests plus 58 other tests
  pass (119). Where a P-256 signature is involved the suite has Daimo's Solidity
  verifier standing in for the precompile (spec §16), so those tests cost more gas
  than the chain will. A third-party review before mainnet money is the line item
  in `08-roadmap-and-grants.md`.
- Libraries: OpenZeppelin 5.1.0 (`P256` for the Solidity fallback, `Base64`,
  `Create2`, `Clones`, `ERC1967Proxy`, `ERC1967Utils`, and the `IERC20`,
  `IERC1271`, `IERC721Receiver` interfaces), audited; pinned by commit in
  `contracts/lib`. The WebAuthn envelope and the EIP-712 hashing are our own
  libraries (`WebAuthn`, `ConcordHash`), inside the review above.
- EntryPoint v0.7: audited by OpenZeppelin; the address is an immutable.
- The precompile at `0x100`: part of the chain. `ConcordVerifier` runs the
  Solidity verifier only when the precompile answers empty to both the signature
  and the RIP-7212 specification vector, so on Arc the Solidity code never decides
  a signature (spec §5.4).

## Not building, on purpose

A Safe-compatible transaction service API, Safe{Wallet} support, Zodiac module
deployments, the `TreasuryGuard` and `PayrollAllowance` sketches from the first
draft. Each was a workaround for a policy the account now has.
