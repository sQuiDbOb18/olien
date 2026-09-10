# Metropolis: the plan to win

Monad's global hackathon, 1 September to 13 October 2026, $250,000 across four
tracks, a grand champion and sponsor bounties. Written 2026-09-10, the day Frank
decided to go for it. Facts below were verified on chain or in the sponsors' own
docs that day; nothing here is from memory.

## What we enter

**Olien on Monad**: the account protocol and the treasury console, with payroll,
cheques, passkey members, API keys and webhooks. The consumer app stays on Arc
for now; the decision about where it lives is made on 14 October with a Circle
answer and a Monad answer both in hand (see "What we do not do").

The rule that makes us eligible: "what you show on 13 Oct should have been built
during the six weeks." Everything in `docs/treasury/` from 4 September on was.
The Olien contracts, the console, the service, payroll, cheques, keys, webhooks,
the passkey veto through a user operation: all inside the window. We are not
porting old code; we are finishing new code on a second chain.

## Where it lands

| Track or bounty | Their words | What we show |
| --- | --- | --- |
| Track 4, Trust, Identity and AI Infrastructure, $30k over 3 | "Passkey-native accounts using P256 and WebAuthn, with no seed phrase" | An Olien whose members are passkeys: Touch ID approves, spends from a limit, vetoes a change through a user operation. No seed phrase anywhere in the product. |
| Track 2, Consumer Products and Payments, $30k over 3 | "Shared wallets and group spending that settle up without an intermediary"; "a payments app that never mentions a blockchain" | A team treasury that pays payroll, writes cheques, and never says chain, gas or nonce to the person using it. |
| Agora, $10k | Best cross-border payments app on Monad | A treasury paying contractors in five countries in one run, one signing round, USDC; a cheque a contractor cashes when their invoice is due. |
| Mera, $2.5k | One passkey, many keys | One passkey is a signer on several Oliens at once, and on the phone; the same key, many accounts. |
| Best Agent Wallet Plugin, $2.5k | | An MCP server over the treasury API: an agent with a propose key opens payouts and reads the ledger, and can never sign. This is the one new component; it is small. |
| Grand champion, $25k | "The best build of Metropolis" | The whole thing, live on mainnet, with real teams using it. |

Realistic outcome for a strong entry: $10k to $15k. Sweeping what fits: about
$45k. Plus the residency and DeltaV, which are worth more than the cheque.

## What Monad has, verified 2026-09-10

| Need | Monad testnet 10143 | Monad mainnet 143 | How |
| --- | --- | --- | --- |
| EntryPoint v0.7 at `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | present | present | `cast code` |
| Arachnid CREATE2 deployer at `0x4e59b44847b379578588920cA78FbF26c0B4956C` | present | present | `cast code` |
| P256 precompile (RIP-7212) | absent as far as a call can tell | same | the verifier's Solidity fallback covers it, at more gas |
| Native USDC, FiatToken v2, EIP-3009 | `0x534b2f3A21130d7a60830c2Df862319e593943A3` | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` | `symbol`, `version`, `authorizationState` called on testnet; addresses from Circle's docs |
| CCTP V2 | domain 15, standard transfer and forwarding, no fast transfer, no upfront fees on testnet | domain 15, standard, upfront fees, forwarding | Circle's docs |
| Bundler and paymaster | Pimlico, v0.6/0.7/0.8 | same | Pimlico's docs |

So the Olien deploys to the addresses it already has, USDC cheques and invoices
work as they do on Arc, deposit addresses work with domain 15, and a paymaster
exists for the day the consumer account comes over.

What is different from Arc and has to be handled: gas is MON, not USDC. The
relayer holds MON; an Olien's EntryPoint deposit is MON; the ledger's gas rows
are MON; the relayer alarm reads MON. Every place the code or the copy says the
account pays gas in USDC is a place to change. Earn (USYC) and Convert (EURC via
StableFX) are Arc things and are not part of this entry.

## The calendar

Six days of Arc mainnet first, because it is built and it is also a money story.
Then four weeks on Monad, each with one thing that has to be true at its end.

**10 to 16 September, Arc mainnet.** Verify the deployer and EntryPoint on chain
5042, deploy nothing that holds money, submit the Circle grant. Light week by
design. In the gaps: the backend becomes properly multi-chain (a deployment
file per chain, gas unit per chain), which touches nothing on Arc.

**17 to 23 September, live on Monad.** Contracts to Monad testnet and mainnet
via CREATE2, relayer funded with MON, console pointed at Monad, an Olien
created, a payment proposed, signed by a wallet and by a passkey, executed. The
proof accounts and hashes go in this file. End state: the thing exists on the
chain the judges use.

**24 to 30 September, the demo is true.** Payroll run on Monad. A cheque written
by a treasury and cashed by its recipient on Monad, which needs a cashing page
in the console since the phone is on Arc: a link the recipient opens, a wallet or
a passkey, one button. A deposit through CCTP from Base to a Monad Olien. The
MCP server over the API. The passkey veto run against a real passkey, which is
owed on Arc too. End state: every sentence in the table above can be done live.

**1 to 7 October, people and polish.** Five to ten real teams with treasuries on
Monad mainnet, found through X, the Monad Discord and the hacker lounges. The
film: the code-rendered pipeline in `docs/marketing/film/` already exists, so
the demo video costs zero credits and a day. A landing page for Olien on Monad.
Docs a judge can read in ten minutes. End state: traction on chain a judge can
click, and a video that lands in ninety seconds.

**8 to 13 October, submission.** The public project profile: demo, write-up,
code link. Decide what code is public (the Olien contracts, the console and the
service are the entry; the consumer app can stay private). Apply to each bounty
explicitly, in its own words. Submit on the 11th, not the 13th.

## What judges see, in order

1. The ninety-second film: a treasury, three members, one is a passkey, payroll
   goes out, a cheque gets cashed, a change gets vetoed from a phone. No chain
   words on screen.
2. A live account on Monad mainnet with real teams and real movements.
3. The spec (`10-account-spec.md`) and the adversarial review log in it, for the
   judge who reads.
4. The tests: 157 contract, 94 backend, 204 phone, and the vectors that pin the
   Rust to the Solidity and to the phone.

## What we do not do

- We do not port the consumer app during the hackathon. It has Arc in its bones
  (USDC as gas, USYC, EURC, the precompile) and would cost three weeks and two
  features. The Olien is the entry.
- We do not build lending. Track 1 names undercollateralised lending; the social
  spec already says why not, and a judge who knows the field will agree.
- We do not add sponsors' SDKs we do not need to chase small bounties. Envio,
  Dynamic, Privy, Chainlink CRE and Nansen are not our shape; a bounty chased
  at the cost of the main entry is a net loss.
- We do not skip the physical testing. Every feature from this week is untested
  by a person on any chain. The Monad week is where that debt gets paid, on the
  chain that is being judged.

## Open facts to settle in week one

- Whether EURC exists on Monad (Convert stays out either way).
- Which Monad RPC to run the indexer against, and its `eth_getLogs` cap.
- Pimlico's Monad paymaster pricing, for the day the consumer account moves.
- What the official rules on the application platform restrict.
