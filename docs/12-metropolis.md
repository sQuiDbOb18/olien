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

## Two decisions taken on 2026-09-10

**Arc stays.** The pitch is: Olien is the account protocol, Recourse is the first
app on it, Monad is the second chain. A Recourse user approves a treasury
payment from their phone with Face ID, which is true today through the Safe as
a contract signer; "Recourse runs on Olien" is not true yet and is not said.

**The repos split on the 17th, first task of the Monad week.** A public `olien`
repo takes the contracts, tests and deploy scripts, the spec and these docs,
the console, the treasury service and the deployment files, extracted with
`git filter-repo` so every commit keeps its date, which is the proof of the
build window. The consumer app, its backend and the phone's Olien signer stay
private. Two couplings get cut on the way: the treasury keeps its own cheque
table and the consumer backend reads issued cheques over the API, and
membership by @handle or by Safe becomes an optional integration the service
calls when configured. Railway gets a second service, Vercel a second project,
the console its own domain.

**A second entry, for Agora's mobile trading bounty ($10k, single prize).** It is a
separate product with a separate deadline, so it is a separate project, planned and
built in its own repository rather than here. Olien on Monad is the primary entry and
wins every collision on the calendar below.

What belongs to this repo is the passkey work the two share, which is also what the
Mera bounty in the table above asks for: one passkey, many keys.
`mobile/Recourse/Core/Auth/PasskeyAccounts.swift` derives an EVM account and an
Ed25519 account from one passkey's PRF output following mera's rule (salt
`sha256("mera.prf.salt.v1")`, the 32 bytes as BIP-39 entropy, empty passphrase, EVM at
m/44'/60'/0'/0/0, Ed25519 at m/44'/501'/0'/0' by SLIP-0010), and `PasskeyAccountsTests`
pins it to a vector computed with the libraries mera's own demo uses. The debug
"Passkey PRF probe" screen prints the accounts, and the page at `/spike/passkey` on the
marketing site runs mera's own library at the same relying party. What is left is the
phone: run the probe, open the page in Safari with the same passkey, and compare.

## The calendar

Six days of Arc mainnet first, because it is built and it is also a money story.
Then four weeks on Monad, each with one thing that has to be true at its end.

**10 to 16 September, Arc mainnet.** Frank: register on the platform (team of
one, two projects), the physical testing owed on Arc testnet (phone rebuilt,
deposit end to end on Base Sepolia, vault redeployed with the USYC teller,
factory on the other seven chains), the Circle grant, the PRF spike on the
phone, and on the 16th the deployer and EntryPoint verified on chain 5042 with
nothing deployed that holds money. The service: the backend becomes properly
multi-chain (a deployment file per chain, gas unit per chain), which touches
nothing on Arc; the file list and cut points for the split, ready for the 17th.

**17 to 23 September, live on Monad.** Contracts and funding are done, a day
early. The rest of the week is the console pointed at Monad, an Olien created, a
payment proposed, signed by a wallet and by a passkey, executed. End state: the
thing exists on the chain the judges use.

Olien went to Monad testnet on 2026-09-16, all four contracts, 9,549,513 gas at
about 103 gwei for 0.9836 MON total. They landed on the addresses they already
hold on Arc, and the deployed bytecode was read off both chains and hashed:
identical. That is what a fixed salt and identical creation code through the
Arachnid deployer at `0x4e59b44847b379578588920cA78FbF26c0B4956C` are supposed
to give, and now it is measured rather than assumed.

| Contract | Address | Transaction | Block |
| --- | --- | --- | --- |
| OlienVerifier | `0xE196558Ce080229B256dDE6e62CDA2B051B882fC` | `0x55f7fdae43cf616d742bcdf4babcdc0dbda6ef2c41090b3d98f22fba39edd78d` | 63016192 |
| SubAccount | `0xDfc576536187eF72689c514f8c7ea6487960a637` | `0x6646f4b3df1e43884e2287380ee8aa82d6bd4183e79c569e2bf869d938d1e634` | 63016195 |
| Olien | `0x8BFf8CCe4edbE882a21197D3942978CCd06fA427` | `0x78ad5cfb538a7f9762dc745d2dac9117eb0d625c2a0eca7002b3a13a58eeb2a8` | 63016199 |
| OlienFactory | `0xaF8c108D09E6A159D4dcE0919Ca6A81d6019f131` | `0x4b6ff3f98107d48a89a0094fdcf0f034ba32c18d9ae2c8ee20708e310e92bda5` | 63016202 |

All four receipts read back `status true`. Their `contractAddress` field is empty,
which is not a problem: a CREATE2 deployment's recipient is the Arachnid deployer,
so the receipt has no created address to report. A plain CREATE would have filled it.

Deployed by the attestor EOA `0xD6c574461d96Ee708f58Fe553049aD4f48BB983A`, which
held 5 MON from the faucet and has about 4.02 left. Gas on Monad is MON, not USDC.

**This did not need the repo split.** CREATE2 derives an address from the salt and
the creation code, never from the sender or the repository, so deploying out of
`recourse` put them exactly where deploying out of a split `olien` would have. The
split is still worth doing for a clean public repo the judges can read, but it was
never a gate on the contracts existing.

Monad mainnet, chain 143, has nothing deployed and nothing read off it yet.

**The service and the console do not need the split either, checked 2026-09-16.**
The backend takes its chain entirely from `DEPLOYMENTS_PATH` and the image already
carries every file in `deployments/`, so a second Railway service reading
`10143.json` is a Monad Olien service. It refused to boot at first, because
`Deployment` required the consumer contracts and Monad has none of them. Those four
fields are optional now, and the consumer jobs sit behind a `consumer` flag, so the
escrow indexer, the auto resolver, the projection reset and the attestor all stay off
while the treasury service and its indexer run alone. 96 backend tests pass, two of
them pinning the file contract in both directions: a Monad file must parse without the
consumer contracts, and an Arc file must still yield them.

On that chain the service reports what it should: id 10143, `Monad Testnet`, gas in
MON rather than USDC, no EURC, and the Monad explorer. The treasury enables itself
from `ATTESTOR_PK` where `RELAYER_PK` is absent, so it needs no new secret.

The console was already chain-parameterised and builds for Monad today:
`NEXT_PUBLIC_OLIEN_CHAIN=monad-testnet npm run build` compiles in 15 seconds and emits
all seven Olien routes. `chain.ts` hardcodes Monad's id, RPC, explorer and USDC, and
imports the Arc deployment file only to fill the Arc entry, so a Monad build needs no
Monad deployment file.

So "live on Monad" was two deploys and no code. The first is done.

**The service is live, 2026-09-17**, at
`https://olien-monad-testnet-production.up.railway.app`, a second Railway service in
the Recourse project built from the same root Dockerfile, with its own Postgres
(`Postgres-OWhw`, confirmed a different database from the consumer one by comparing
hashes rather than eyes), `DEPLOYMENTS_PATH=/app/deployments/10143.json`, and
`ATTESTOR_PK` as the relayer.

It answers what it should. `/health` gives chain 10143 and a relayer balance in MON.
`/api/treasury/chain` gives `Monad Testnet`, native MON, the Monad explorer, Monad's
USDC, `eurc: null`, and the factory and implementation deployed the day before. The
Olien indexer runs, and `indexedPayments` is 0 because the escrow indexer is off,
which is the consumer gating doing its job on a real chain rather than in a test.

Two things worth keeping. A generated Railway domain comes with **no target port**,
and the service is unreachable until one is set: `railway domain update <id> --port
8080`, which is what the consumer service already had and the new one silently did
not. And `railway add` ignores its flags and opens an interactive picker, so the
database came out named `Postgres-OWhw` rather than the name asked for.

**The relayer is under its floor**: 4.0164 MON against a 5 MON minimum, which the
indexer warns about on every cycle. Executions will fail until it is faucetted.

**The console is live too, 2026-09-17**, at `https://olien-console-monad.vercel.app`,
a second Vercel project `olien-console-monad` in the same team as `recourse-web`, built
from the same `web/` with `NEXT_PUBLIC_OLIEN_CHAIN=monad-testnet` and
`NEXT_PUBLIC_BACKEND_URL` pointed at the Railway service. Both pages answer 200 and
render the console.

What is proven: the environment variables were on the project for Production before the
build ran, the build succeeded, and the site is public. What is not proven by command
line: that the running page talks to Monad rather than Arc, because the values are
inlined into chunks React streams after hydration and never appear in the initial HTML.
Settings shows it, since the console compares its own chain against the service's
`/api/treasury/chain`. Check it once and write the answer here.

Three traps, all of which cost time and will recur on the next chain:

- The console imports `../../deployments/arc-testnet.json`, so it cannot be built from
  inside `web/`. The upload has to be the repository root with the project's
  `rootDirectory` set to `web`, which is how `recourse-web` is configured.
- `vercel project add` cannot set `rootDirectory` or `framework`. Both had to go in by
  PATCH to `/v9/projects/{id}`.
- A new Vercel project defaults to `ssoProtection: all_except_custom_domains`, which
  protects **production** as well, so the console answered 302 to a Vercel login until
  it was set to null. `recourse-web` has it null. A judge hitting an SSO wall would
  have looked like a broken entry.

The root of the repository stays linked to `recourse-web` and `web/.vercel` links to
the console, so a deploy from the wrong directory targets the wrong project. The live
marketing deployment was checked before and after and did not move.

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

## Facts settled 12 September, read off the chain and the sponsors' docs

- **EURC is not on Monad.** Circle lists it on nine chains and Monad is not among
  them, so Convert is out of the port for good rather than by choice.
- **`eth_getLogs` is capped at 100 blocks on every public Monad testnet endpoint**
  tested: the official one, Ankr, and thirdweb, which caps by response size instead.
  Mainnet is better, 1,000 blocks on Alchemy's `rpc1.monad.xyz` and Ankr's
  `rpc3.monad.xyz`, 100 on QuickNode's `rpc.monad.xyz` and the Foundation's. Blocks
  arrive every 300ms, so 100 blocks is 30 seconds of history per call. The indexer
  chunks at 5,000, which is Arc's limit, so the chunk size has to become a fact about
  the chain rather than a constant.
- **Pimlico supports Monad** on both 10143 and 143: bundler for EntryPoint v0.6, v0.7
  and v0.8, and the verifying paymaster for v0.6 and v0.7. The ERC-20 paymaster is not
  listed, which only matters on the day the consumer account moves.
- **EntryPoint v0.7 and the Arachnid CREATE2 deployer are both live** on 10143, so the
  addresses can be computed before anything is deployed.
- Still open: what the rules on the application platform restrict.
