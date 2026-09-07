/**
 * Bringing USDC to Arc from another chain, through Circle's own bridge.
 *
 * CCTP burns the USDC on the source chain and mints the same amount on Arc, so
 * the dollars that arrive are native Arc USDC rather than a wrapped claim on
 * someone's vault. Circle's forwarding service completes the mint, which is why
 * the person depositing signs exactly one transaction, on a chain where they
 * already hold gas, and needs nothing at all on Arc.
 *
 * Every address and domain below was read off the contracts on 2026-09-07, not
 * copied from a page: Arc answers 26 to localDomain(), each source chain has Arc
 * registered as a remote messenger, and Arc maps each source USDC to its own.
 */
import { arbitrumSepolia, baseSepolia, sepolia } from "viem/chains";
import type { Chain } from "viem";

export const ARC_DOMAIN = 26;

/** The same address on every EVM testnet; mainnet uses a different one. */
export const TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as const;

/**
 * The reserved hook that hands the destination mint to Circle. Without it the
 * message still lands, but somebody has to pay for a transaction on Arc to
 * finish it, and the whole point is that the depositor does not have to.
 */
export const FORWARDING_HOOK = "0x636374702d666f72776172640000000000000000000000000000000000000000" as const;

/** Below 1000 asks for the fast path, which costs a fee and lands in seconds. */
export const FAST_FINALITY = 1000;

export type SourceChain = {
  key: string;
  name: string;
  domain: number;
  chain: Chain;
  usdc: `0x${string}`;
  /** Roughly how long the fast path takes from this chain, for the waiting copy. */
  seconds: number;
};

export const SOURCE_CHAINS: SourceChain[] = [
  { key: "base", name: "Base", domain: 6, chain: baseSepolia, usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", seconds: 10 },
  { key: "arbitrum", name: "Arbitrum", domain: 3, chain: arbitrumSepolia, usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", seconds: 10 },
  { key: "ethereum", name: "Ethereum", domain: 0, chain: sepolia, usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", seconds: 25 },
];

const IRIS = "https://iris-api-sandbox.circle.com";

export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export const tokenMessengerAbi = [
  {
    type: "function",
    name: "depositForBurnWithHook",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

/** An EVM address as CCTP carries it, left padded into a word. */
export function asBytes32(address: string): `0x${string}` {
  return `0x000000000000000000000000${address.replace(/^0x/, "").toLowerCase()}` as `0x${string}`;
}

export type FeeQuote = {
  /** Circle's cut, in basis points of the amount. */
  bps: number;
  /** What the forwarder charges to complete the mint, in USDC subunits. */
  forward: bigint;
};

/**
 * Fees move, so they are read per deposit rather than baked in. The high estimate
 * for forwarding is the one used: quoting the median and missing it downgrades the
 * transfer to the slow path silently, which reads to the depositor as a bug.
 */
export async function fetchFee(domain: number): Promise<FeeQuote> {
  const response = await fetch(`${IRIS}/v2/burn/USDC/fees/${domain}/${ARC_DOMAIN}?forward=true`);
  if (!response.ok) throw new Error("Circle could not quote a fee for this chain right now.");
  const rows = (await response.json()) as { finalityThreshold: number; minimumFee: number; forwardFee?: { high: number } }[];
  const fast = rows.find((row) => row.finalityThreshold <= FAST_FINALITY) ?? rows[0];
  if (!fast) throw new Error("Circle quoted no route from this chain to Arc.");
  return { bps: fast.minimumFee, forward: BigInt(fast.forwardFee?.high ?? 0) };
}

/**
 * The ceiling the burn authorises. It has to cover Circle's cut and the forwarder,
 * and a fifth is added on top because a quote that expires between the read and
 * the signature would otherwise cost the depositor fifteen minutes.
 */
export function maxFeeFor(amount: bigint, quote: FeeQuote): bigint {
  const cut = (amount * BigInt(Math.ceil(quote.bps * 100))) / 1_000_000n;
  return ((cut + quote.forward) * 12n) / 10n;
}

export type Attestation = {
  status: "pending" | "complete";
  /** Present once Circle's forwarder has completed the mint on Arc. */
  forwardTxHash?: string;
  /** Why a transfer is sitting still, when Circle says. */
  delayReason?: string;
  message?: string;
  attestation?: string;
};

/**
 * Circle indexes the burn a moment after it lands, so a miss here is the normal
 * first answer rather than a failure.
 */
export async function fetchAttestation(domain: number, burnTx: string): Promise<Attestation | null> {
  const response = await fetch(`${IRIS}/v2/messages/${domain}?transactionHash=${burnTx}`);
  if (response.status === 404) return null;
  if (!response.ok) return null;
  const body = (await response.json()) as {
    messages?: { status?: string; forwardTxHash?: string; delayReason?: string | null; message?: string; attestation?: string }[];
  };
  const first = body.messages?.[0];
  if (!first) return null;
  return {
    status: first.status === "complete" ? "complete" : "pending",
    forwardTxHash: first.forwardTxHash,
    delayReason: first.delayReason ?? undefined,
    message: first.message,
    attestation: first.attestation,
  };
}

export function formatUsdc(value: bigint): string {
  const whole = value / 1_000_000n;
  const cents = (value % 1_000_000n) / 10_000n;
  return `${whole}.${cents.toString().padStart(2, "0")}`;
}

export function parseUsdc(text: string): bigint | null {
  if (!/^\d*\.?\d*$/.test(text.trim()) || text.trim() === "" || text.trim() === ".") return null;
  const [whole, fraction = ""] = text.trim().split(".");
  if (fraction.length > 6) return null;
  return BigInt(whole || "0") * 1_000_000n + BigInt((fraction + "000000").slice(0, 6));
}
