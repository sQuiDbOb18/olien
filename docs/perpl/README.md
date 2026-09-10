# Perpl spike

What `spike.mjs` established against Perpl testnet on 2026-09-10, so the trading
app (docs/treasury/12-metropolis.md, the Agora bounty) starts from facts.

## Proven with a throwaway key, no collateral

- `POST /api/v1/api-key/payload` accepts `{ chain_id, address, public_key, scope_mask,
  label }` with the Ed25519 public key as 32 bytes of 0x-hex, and answers EIP-712
  typed data plus a `mac`. The typed data is primary type `PerplRegisterApiKey`,
  domain `{ name: "perpl.xyz", version: "1", chainId, verifyingContract: 0x0, salt }`,
  message fields `builderId, expiresAt, ipCidrs, label, maxBuilderFeePer100K, origin,
  publicKey, scope, signer, statement, time`. The chain id arrives as a hex string;
  viem wants a number and hashes the same bytes.
- `POST /api/v1/api-key/enroll` with the wallet's EIP-712 signature and the Ed25519
  proof of possession over the digest answers **404 for a wallet with no exchange
  account**. So enrolment needs the account first, which is what the docs say:
  "trading also requires an on-chain exchange account (created with initial
  collateral on the Exchange contract)".

## The Exchange contract, from the SDK's ABI

`crates/sdk/abi/dex/Exchange.json` in PerplFoundation/dex-sdk. The calls the phone
will make, in order:

1. `aUSD.approve(exchange, amount)`: aUSD is a plain ERC-20, six decimals.
2. `Exchange.createAccount(uint256 amountCNS)`: opens the account with its first
   collateral. `getAccountByAddr(address)` reads it back; `AccountId` is a `u32`.
3. `Exchange.depositCollateral(uint256 amountCNS)` for later top-ups.
4. Enrol the Ed25519 key (one wallet signature), then trade over the websocket.
5. Withdrawals are contract calls signed by the wallet, never by the API key.

Testnet: Exchange `0x1964C32f0bE608E7D29302AFF5E61268E72080cc`, aUSD
`0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`, API `https://testnet.perpl.xyz/api`,
websocket `wss://testnet.perpl.xyz/ws/v1/trading`, BTC is perpetual 16. Mainnet:
Exchange `0x34B6552d57a35a1D042CcAe1951BD1C370112a6F`, aUSD
`0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`, BTC is 1. Market ids, price and size
decimals come from `GET /api/v1/pub/context`.

## Still to do, with testnet aUSD in hand

Run the script with a wallet that holds testnet aUSD and MON: approve, create the
account, then `PERPL_PK=... node docs/treasury/perpl/spike.mjs` should print the
API key, a signed REST answer, the wallet snapshot and an order status of 0. Where
testnet aUSD comes from is not in Perpl's docs; the testnet app is the place to look.

## What this means for the app

The Mera passkey derives the wallet that signs steps 1, 2 and the enrolment, and
the Ed25519 key that signs every trade. The phone needs a little MON for the two
contract calls. Nothing is stored except what the user can re-derive from the
passkey, except the opaque `api_key` token Perpl issues at enrolment, which the app
keeps in the keychain and can re-issue by enrolling again.
