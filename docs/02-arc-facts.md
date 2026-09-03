# Arc facts

Everything here was checked against Arc testnet (chain id 5042002) on 2026-09-03,
either by reading code at an address, by a transaction that landed, or by a document
Circle or Arc publishes. The method is stated per fact.

**Mainnet: public on 2026-09-16.** Arc's own announcement and Circle's press release
of 2026-08-05 say the chain is in private mainnet with more than a hundred builders
and opens on September 16 (arc.io blog "arc-mainnet-goes-live-on-september-16-2026";
circle.com pressroom, founding validator cohort). Mainnet chain id 5042 appears in the
chainid.network registry, The Graph's network list and Safe's deployment registry;
Arc's docs still say mainnet addresses are not yet available. Founding validators
(permissioned, proof of authority): BlackRock, DTCC, Galaxy, Global Payments, ICE,
Mastercard, MoneyGram, SBI, Standard Chartered, Sumitomo, Visa, and Circle.

**Safe on mainnet already.** A Safe-team account registered canonical Safe 1.3.0,
1.4.1 and 1.5.0 for chain 5042 in `safe-deployments` on 2026-05-21 (pull request
1622), after registering testnet in January and July. So the account contracts this
design uses will be at the same addresses on mainnet; the first job on launch day is
to confirm code sizes, not to deploy.

## The chain

| Fact | Value | How checked |
| --- | --- | --- |
| Client | `arc/v1` (Reth execution, Malachite consensus) | `web3_clientVersion`; docs.arc.io system overview |
| EVM baseline | Osaka, active since block 44,287,067 (2026-05-27) | CLZ opcode and P-256 precompile flip at that block; docs "evm-differences" |
| EIP-7702 | live, unused (zero type-4 transactions in a 400-block sample) | a signed type-4 transaction is accepted; docs say it behaves as on Ethereum |
| P-256 precompile (RIP-7212 at `0x100`) | live, about 6,900 gas | RIP-7212 specification vector returns `…01`; `eth_estimateGas` 30,775 for the call |
| Gas token | USDC. Native balance is 18-decimal, the ERC-20 view is 6-decimal, same ledger | `eth_getBalance` of the EntryPoint equals `balanceOf` times 1e12 |
| Gas price | 25 gwei base, 5 gwei priority at the time of testing; testnet floor 20 gwei; docs target about 0.01 USD per transaction and say parameters may change before mainnet | `eth_gasPrice`, `eth_maxPriorityFeePerGas`; docs "gas-and-fees", "stable-fee-design" |
| Fee destination | testnet docs: base fee not burned; the ARC whitepaper (May 2026) describes fees converted to a future ARC token and split between validators and a burn | docs "evm-differences"; the whitepaper. Treat as unsettled until mainnet |
| Block time | about 1 second | receipts landed within 1 to 3 seconds throughout |
| Public RPC | `rpc.testnet.arc.network` rate-limits (429) a backend making a dozen calls in a row; `arc-testnet.drpc.org` did not | provisioning failed on the official RPC and succeeded on drpc, same code |
| Blocklist | USDC transfers to or from blocklisted addresses revert at runtime | docs "evm-differences" |

## USDC

`0x3600000000000000000000000000000000000000` is a `FiatTokenProxy` in front of
`NativeFiatTokenV2_2`: Circle's standard token family, with the native balance as its
ledger. Consequences, each verified by a call or a transaction:

- `permit`, `transferWithAuthorization`, `receiveWithAuthorization`,
  `cancelAuthorization` exist, with both the `v,r,s` and the `bytes signature`
  overloads; wrong signatures revert with `ECRecover: invalid signature` or
  `FiatTokenV2: invalid signature`.
- **EIP-1271 works.** A Safe's packed owner signatures cashed a
  `transferWithAuthorization` through the `bytes` overload:
  `0x8cb01b030bdbd178f3c2b9819c70847bc1de7127df3300c81714977c361950a0`. A 2-of-3
  Safe with a P-256 owner also verifies (`isValidSignature` answered `0x1626ba7e`
  through the 4337 module's fallback handler, and the cash simulates).
- The `bytes` overload also accepts a plain 65-byte EOA signature, so one code path
  serves both kinds of payer.

## Safe on Arc

Canonical Safe 1.4.1, listed as `"5042002": "canonical"` in `safe-deployments`
(`v1.4.1/safe_l2.json`), and confirmed by code size:

| Contract | Address | Bytes |
| --- | --- | --- |
| SafeL2 1.4.1 singleton | `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` | 24,421 |
| Safe 1.4.1 (L1) singleton | `0x41675C099F32341bf84BFc5382aF534df5C7461a` | 23,579 |
| SafeProxyFactory | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` | 3,054 |
| CompatibilityFallbackHandler | `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99` | 5,637 |
| MultiSend | `0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526` | 629 |
| MultiSendCallOnly | `0x9641d764fc13c8B624c04430C7356C1C7C8102e2` | 410 |
| SignMessageLib | `0xd53cd0aB83D845Ac265BE939c57F53AD838012c9` | 966 |
| CreateCall | `0x9b35Af71d77eaf8d7e40252370304687390A1A52` | 1,099 |
| Safe4337Module v0.3.0 (EntryPoint v0.7) | `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226` | 8,373 |
| SafeModuleSetup v0.3.0 | `0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47` | 547 |
| Safe4337Module v0.2.0 (EntryPoint v0.6) | `0xa581c4A4DB7175302464fF3C06380BC3270b4037` | 8,489 |
| SafeWebAuthnSharedSigner | `0x94a4F6affBd8975951142c3999aEAB7ecee555c2` | 2,954 |
| Safe singleton factory | `0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7` | 69 |
| **Safe Allowance module v0.1.1** | `0xAA46724893dedD72658219405185Fb0Fc91e091C` | 14,908 |

The Allowance module is registered in `safe-modules-deployments` for both 5042002
and mainnet 5042 (an earlier draft of this page looked at the v0.1.0 address,
`0xCFbFaC…`, which is not the one Safe deploys now).

**Absent** (code size 0 at their canonical addresses): Zodiac ModuleProxyFactory
(`0x000000000000aDdB49795b0f9bA5BC298cDda236`), every Zodiac Delay mastercopy
(1.0.0 `0xD62129BF40CD1694b3d9D9847367783a1A4d5cB4`, 1.0.1
`0xd54895B1121A2eE3f37b502F507631FA1331BED6`, 1.1.0
`0x01F8cabB808D7dE0dF4202D4B60C8310d2f1339b`, 2.0.0
`0x66C985001328Db254F27C8A037Ebb409a5d669C2`, from the repository's
`mastercopies.json`, each with its deployment factory and salt), Zodiac Roles v2 mastercopy
(`0x9646fDAD06d3e24444381f44362a3B0eB343D337`), Candide social recovery
(`0x38275826E1933303E508433dD5f289315Da2541c`), Safe Recovery Hub,
SafeWebAuthnSignerFactory (`0x1d31F259eE307358a26dFb23EB365939E8641195`), Gelato
relay. All of these deploy deterministically through the Safe singleton factory or
the Arachnid CREATE2 proxy (`0x4e59b44847b379578588920ca78fbf26c0b4956c`, present), so
they can be put at their canonical addresses by anyone; see `05-onchain-design.md`.

**Nobody is using it.** The last five `SafeProxyFactory` transactions on testnet are
four of ours and one other address. Safe{Wallet} does not list Arc; the transaction
service host for it does not resolve; Safe's client gateway returns 403 for the chain;
`safe-modules-deployments` does not register the 4337 module for 5042002.

## Account abstraction on Arc

| Piece | Status | How checked |
| --- | --- | --- |
| EntryPoint v0.6 `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | 2.4M transactions, mostly Circle `SingleOwnerMSCA` senders through Circle's SponsorPaymaster | arcscan |
| EntryPoint v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | 180k transactions, holds about 14,313 USDC of deposits | arcscan, `eth_getBalance` |
| EntryPoint v0.8 `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` | deployed, quiet | code, arcscan |
| Pimlico bundler | `https://public.pimlico.io/v2/5042002/rpc`, entry points 0.6/0.7/0.8/0.9, paymasters deployed | `eth_supportedEntryPoints`; a user operation executed |
| Circle Modular Wallets (ERC-6900 MSCA) | supported on Arc testnet; weighted WebAuthn multisig plugin on-chain, no public multi-owner API; iOS SDK pre-registers Arc mainnet as chain id 5042 | developers.circle.com supported-blockchains; `modularwallets-ios-sdk` |
| Kernel v3.1, LightAccount v2, ModularAccount v2 factories | deployed, zero transactions | code, arcscan |
| Circle Paymaster (ERC-20 gas) | not on Arc (and moot: gas is USDC) | addresses page has no Arc row |

## Proofs by transaction

All on Arc testnet, from the attestor key.

| What | Where | Gas | Cost at 25 gwei |
| --- | --- | --- | --- |
| Deploy a Safe through the factory (1 owner) | `0x5aeca1076b4fb90920d879082a8028dd31f3be72e2b551eef32737b17ae542da` | 259,003 | 0.0065 USDC |
| Deploy a Safe with 3 owners and the 4337 module enabled in setup | `0x93B5497A85be58436E6667140C9AaC7Fac9E5304` (the account) | 336,058 | 0.0084 USDC |
| Deploy a `P256Owner` (device key contract) | factory `0xBb27F2339a48aE263527b3F2DD871ec12a7E7ce8` | 334,517 | 0.0084 USDC |
| Cash a cheque signed by a Safe (EIP-1271 through USDC) | `0x8cb01b030bdbd178f3c2b9819c70847bc1de7127df3300c81714977c361950a0` | 112,428 | 0.0028 USDC |
| User operation from a 1-of-1 Safe, gas from its own USDC | `0xebf4f0c6def43226a18ee97ce5af1fed3dfc8a0bf25d3b6fe39aadcc6229aa33` | 183,809 | 0.0047 USDC |
| User operation from the 2-of-3 Safe, signed by EOA + P-256 | `0x2daf3d0b75cc9d00c35624e399243473769a2afb7503fafbec77d15aaaa74456` | 202,729 | 0.0052 USDC |
| `swapOwner` on the 2-of-3 Safe, relayed, signed by EOA + recovery EOA | `0x37928263fdd79f2afd6cf9dd23a6aafe88b85ced9b615f225b8699cfb302a976` | about 75k | 0.002 USDC |
| **Team Safe whose owner is the 2-of-3 Safe**: `execTransaction` with one EOA signature and one nested contract signature (inner: EOA + P-256) | `0x242880bba98c628f8bfe1dcf18bd7ab63bc66a66d8d51c5a29f34a1d43044fce` on team Safe `0xABE4dA9A4113114AbD6C821910947DD92c3BBA30` | 155,851 | 0.0039 USDC |

The last row is the one that makes a consumer account a first-class member of a
team treasury with no extra contracts: Safe 1.4.1 verifies a contract owner through
the legacy `isValidSignature(bytes,bytes)`, the inner Safe wraps the outer
transaction bytes in its own `SafeMessage`, and its owners sign that. The packed
outer signature was 418 bytes; the inner one 226.

## What this means for the product

- Every contract the product needs is either present or deployable at its canonical
  address without anyone's permission.
- The account model can be one thing: a Safe, at both the person and the team level.
- Gas is small enough to ignore in pricing: a busy team doing 100 executions a day
  spends about 0.5 USDC.
- The missing layer is entirely off-chain: a transaction service, an indexer, and
  clients. That is the product.
