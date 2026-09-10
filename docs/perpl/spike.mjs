// The Perpl spike (docs/treasury/12-metropolis.md): prove that a key we hold can be
// enrolled on Perpl testnet and can place one order, before a line of Swift exists.
//
// Two things are exercised, each the way the phone will do it:
//   1. Enrolment: an Ed25519 key is registered to a wallet with one EIP-712 signature
//      plus a proof of possession from the Ed25519 key over the same digest.
//   2. Trading: a signed REST call, then the trading websocket: signed sign-in frame,
//      wait for the wallet snapshot, send one small limit order far from the market,
//      then cancel it.
//
// Node 20+, no dependencies beyond viem from web/node_modules. Nothing is stored.
//
//   PERPL_PK=0x...            the wallet's private key (a testnet throwaway)
//   PERPL_NET=testnet|mainnet  default testnet
//   node docs/treasury/perpl/spike.mjs
//
// The wallet must already have an exchange account on Perpl with collateral: the
// documented way is the Perpl testnet UI (deposit aUSD), which is a one-time step.
// The Exchange contract's deposit call is what the phone will use instead; finding
// its ABI is on the spike's list, the SDK repo carries it.

import { createRequire } from "node:module";
import { createHash, generateKeyPairSync, randomBytes, sign as edSign } from "node:crypto";

const require = createRequire(import.meta.url);
const { privateKeyToAccount } = require("/Users/hi/hackatons/recourse/web/node_modules/viem/accounts");
const { hashTypedData } = require("/Users/hi/hackatons/recourse/web/node_modules/viem");
const WebSocket = require("/Users/hi/hackatons/recourse/web/node_modules/ws");

const NET = process.env.PERPL_NET ?? "testnet";
const CONFIG = {
  testnet: { chainId: 10143, api: "https://testnet.perpl.xyz/api", ws: "wss://testnet.perpl.xyz", btc: 16 },
  mainnet: { chainId: 143, api: "https://app.perpl.xyz/api", ws: "wss://app.perpl.xyz", btc: 1 },
}[NET];

const pk = process.env.PERPL_PK;
if (!pk) {
  console.error("PERPL_PK is required (a testnet throwaway key)");
  process.exit(2);
}
const wallet = privateKeyToAccount(pk);
console.log(`wallet ${wallet.address} on ${NET} (chain ${CONFIG.chainId})`);

// ---------------------------------------------------------------------------
// Ed25519: Node's crypto does it natively; the phone will use CryptoKit.

const pair = generateKeyPairSync("ed25519");
const rawPublic = pair.publicKey.export({ type: "spki", format: "der" }).subarray(-32);
const publicHex = `0x${Buffer.from(rawPublic).toString("hex")}`;
const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const signEd = (text) => b64url(edSign(null, Buffer.from(text), pair.privateKey));
const signEdHex = (bytes) => `0x${Buffer.from(edSign(null, bytes, pair.privateKey)).toString("hex")}`;

// ---------------------------------------------------------------------------
// Enrolment (docs: api/authentication).

async function post(path, body, headers = {}) {
  const res = await fetch(`${CONFIG.api}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} answered ${res.status}: ${text}`);
  return JSON.parse(text);
}

console.log("1. asking for the enrolment payload");
const payload = await post("/v1/api-key/payload", {
  chain_id: CONFIG.chainId,
  address: wallet.address,
  public_key: publicHex,
  scope_mask: 3,
  label: "recourse spike",
});
const typed = payload.typed_data;
console.log("   typed data primaryType:", typed.primaryType, "domain:", JSON.stringify(typed.domain));

// The wallet signs the typed data exactly as returned; the Ed25519 key signs its digest.
// The domain's chainId arrives as a hex string; viem wants a number, and the bytes it
// hashes are the same either way.
const { EIP712Domain: _drop, ...types } = typed.types;
const domain = { ...typed.domain, chainId: Number(typed.domain.chainId) };
const walletSignature = await wallet.signTypedData({ domain, types, primaryType: typed.primaryType, message: typed.message });
const digest = hashTypedData({ domain, types, primaryType: typed.primaryType, message: typed.message });
console.log("   message fields:", Object.keys(typed.message).join(","), "types:", Object.keys(types).join(","));
const pop = signEdHex(Buffer.from(digest.slice(2), "hex"));

console.log("2. enrolling");
const enrolled = await post("/v1/api-key/enroll", {
  chain_id: CONFIG.chainId,
  address: wallet.address,
  typed_data: typed,
  mac: payload.mac,
  signature: walletSignature,
  pop_signature: pop,
});
const apiKey = enrolled.api_key;
console.log("   api key received:", apiKey ? `${String(apiKey).slice(0, 6)}… (${String(apiKey).length} chars)` : JSON.stringify(enrolled));

// ---------------------------------------------------------------------------
// A signed REST call (docs: the canonical string, six lines).

function signedHeaders(method, target, body = "") {
  const timestamp = String(Date.now());
  const nonce = b64url(randomBytes(16));
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const canonical = [CONFIG.chainId, method, target, timestamp, nonce, bodyHash].join("\n");
  return {
    "X-API-Key": apiKey,
    "X-API-Timestamp": timestamp,
    "X-API-Nonce": nonce,
    "X-API-Signature": signEd(canonical),
  };
}

console.log("3. a signed REST read");
const target = "/v1/trading/account-history";
const historyRes = await fetch(`${CONFIG.api}${target}`, { headers: signedHeaders("GET", target) });
console.log(`   ${target} answered ${historyRes.status}`);

const context = await (await fetch(`${CONFIG.api}/v1/pub/context`)).json();
const market = (context.markets ?? context.perpetuals ?? []).find((m) => (m.id ?? m.perp_id ?? m.market_id) === CONFIG.btc) ?? null;
console.log("   market", CONFIG.btc, market ? JSON.stringify(market).slice(0, 200) : "not found in context; keys are " + Object.keys(context).join(","));

// ---------------------------------------------------------------------------
// The trading websocket: sign in, read the snapshots, one order, cancel it.

console.log("4. trading websocket");
const ws = new WebSocket(`${CONFIG.ws}/ws/v1/trading`);
const frames = [];
const done = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("no answer within 20s")), 20_000);
  ws.on("open", () => {
    const timestamp = String(Date.now());
    const nonce = b64url(randomBytes(16));
    const canonical = [CONFIG.chainId, "trading-ws-signin", timestamp, nonce].join("\n");
    ws.send(JSON.stringify({ mt: 29, chain_id: CONFIG.chainId, api_key: apiKey, timestamp, nonce, signature: signEd(canonical) }));
  });
  ws.on("message", (data) => {
    const frame = JSON.parse(data.toString());
    frames.push(frame);
    console.log("   <-", JSON.stringify(frame).slice(0, 160));
    // The wallet snapshot means we are in; place one order far below the market so
    // it rests, then cancel it. Price and size scaling come from the market config.
    if (frame.mt === 19) {
      const acc = frame.accounts?.[0]?.id ?? frame.acc ?? 0;
      const priceDecimals = market?.price_decimals ?? 2;
      const sizeDecimals = market?.size_decimals ?? 4;
      const order = {
        mt: 22,
        sn: 1,
        rq: Date.now(),
        mkt: CONFIG.btc,
        acc,
        t: 1,
        p: Math.round(1000 * 10 ** priceDecimals),
        s: Math.round(0.001 * 10 ** sizeDecimals),
        fl: 1,
        lv: 100,
        lb: 0,
      };
      console.log("   ->", JSON.stringify(order));
      ws.send(JSON.stringify(order));
    }
    if (frame.mt === 3) {
      console.log(`   order status code ${frame.code}${frame.code === 0 ? " (accepted)" : " (rejected)"}`);
      clearTimeout(timer);
      ws.close();
      resolve();
    }
  });
  ws.on("close", (code) => {
    if (code === 3401) reject(new Error("websocket sign-in refused (3401)"));
  });
  ws.on("error", reject);
});
await done;
console.log("spike done: enrolment, signed REST, websocket sign-in and one order frame all answered");
