// Client for the Rust indexer read API (backend/). The backend is a projection of
// Arc state; verdicts in it come from the onchain previewVerdict (R2). The verifier
// and policy builder stay chain-direct on purpose, so this client serves only the
// merchant lists (payments, disputes, receipts, protection).

export const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080";

export interface ApiPayment {
  paymentId: number;
  buyer: string;
  merchant: string;
  beneficiary: string;
  policyId: number;
  amount: string;
  shares: string;
  paidAt: number;
  filedAt: number;
  claimType: number;
  evidenceMask: number;
  attType: number;
  attValue: number;
  evidenceRoot: string;
  verdictBps: number;
  status: number;
  refundBps: number | null;
  requiresReturn: boolean | null;
  ruleIndex: number | null;
  matched: boolean | null;
  verdictHash: string | null;
  updatedAt: string;
}

export interface ApiPolicy {
  policyId: number;
  merchant: string;
  disputeWindow: number;
  defaultRefundBps: number;
  policyHash: string;
  rules: unknown[];
  updatedAt: string;
}

export interface ApiHealth {
  status: string;
  chainId: number;
  indexedPayments: number;
  demoMode: boolean;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return (await res.json()) as T;
}

export const getPayments = (merchant?: string) =>
  get<ApiPayment[]>(`/api/payments${merchant ? `?merchant=${encodeURIComponent(merchant)}` : ""}`);
export const getDisputes = () => get<ApiPayment[]>("/api/disputes");
export const getPolicies = () => get<ApiPolicy[]>("/api/policies");
export const getHealth = () => get<ApiHealth>("/health");

// Mirrors RecourseEscrow.Status and the engine claim-type table so live rows read
// in product language rather than raw enum indexes.
export const PAYMENT_STATUS = ["None", "Paid", "Disputed", "Settled"] as const;
export const CLAIM_TYPES = ["Not delivered", "Damaged", "Not as described", "Wrong item", "Other"] as const;

// Amounts are u128 base units at USDC's 6 decimals (R1); format without floats so
// large values stay exact.
export function formatUsdc(raw: string): string {
  const n = BigInt(raw || "0");
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole.toLocaleString("en-US")}.${frac} USDC`;
}

export function formatDate(unix: number): string {
  if (!unix) return "Pending";
  return new Date(unix * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function shortAddr(a: string): string {
  return a && a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "unknown";
}

export function statusLabel(status: number): { label: string; tone: string } {
  switch (status) {
    case 1:
      return { label: "Protected", tone: "green" };
    case 2:
      return { label: "Disputed", tone: "amber" };
    case 3:
      return { label: "Settled", tone: "neutral" };
    default:
      return { label: "None", tone: "neutral" };
  }
}

// A disputed or settled payment's outcome, read from the verdict the indexer pulled
// from previewVerdict (falling back to the finalized verdictBps on the payment).
export function verdictOutcome(p: ApiPayment): { label: string; tone: string } {
  const bps = p.refundBps ?? p.verdictBps ?? 0;
  if (bps >= 10000) return { label: "Refunded 100%", tone: "green" };
  if (bps <= 0) return { label: "Denied", tone: "red" };
  return { label: `Partial ${Math.round(bps / 100)}%`, tone: "amber" };
}

export function isDisputed(p: ApiPayment): boolean {
  return p.filedAt !== 0;
}
