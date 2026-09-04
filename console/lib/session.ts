// Account sessions against the backend. On the web the only sign-in is a wallet
// signature (the Olien console); Apple, Google and passkeys are the iOS paths. Opaque
// access/refresh tokens live in localStorage: the access token lasts 15 min, and
// authFetch silently refreshes it via the 30-day refresh token.

import { API_BASE } from "./api";

export interface Account {
  accountId: number;
  provider: string;
  providerUserId: string;
  email: string | null;
  givenName: string | null;
  familyName: string | null;
}

export interface SessionGrant {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  account: Account;
}

const ACCESS = "recourse.session.access";
const REFRESH = "recourse.session.refresh";
const ACCESS_EXP = "recourse.session.accessExp";
const ACCOUNT = "recourse.session.account";

export const SESSION_EVENT = "recourse-session-change";

function store(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function saveSession(grant: SessionGrant) {
  const s = store();
  if (!s) return;
  s.setItem(ACCESS, grant.accessToken);
  s.setItem(REFRESH, grant.refreshToken);
  s.setItem(ACCESS_EXP, String(grant.accessExpiresAt));
  s.setItem(ACCOUNT, JSON.stringify(grant.account));
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function clearSession() {
  const s = store();
  if (!s) return;
  [ACCESS, REFRESH, ACCESS_EXP, ACCOUNT].forEach((key) => s.removeItem(key));
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function cachedAccount(): Account | null {
  const raw = store()?.getItem(ACCOUNT);
  try {
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

export function hasSession(): boolean {
  return Boolean(store()?.getItem(ACCESS));
}

async function refresh(): Promise<string | null> {
  const refreshToken = store()?.getItem(REFRESH);
  if (!refreshToken) return null;
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearSession();
    return null;
  }
  const grant = (await res.json()) as SessionGrant;
  saveSession(grant);
  return grant.accessToken;
}

async function validAccessToken(): Promise<string | null> {
  const s = store();
  if (!s) return null;
  const token = s.getItem(ACCESS);
  const exp = Number(s.getItem(ACCESS_EXP) ?? "0");
  const now = Math.floor(Date.now() / 1000);
  if (token && exp - 30 > now) return token; // still comfortably fresh
  return refresh(); // expired, expiring, or missing: rotate
}

// Authenticated fetch: attaches the bearer and refreshes once on a 401.
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string | null) =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
  let res = await send(await validAccessToken());
  if (res.status === 401) {
    const rotated = await refresh();
    if (rotated) res = await send(rotated);
  }
  return res;
}

export async function fetchMe(): Promise<Account | null> {
  if (!hasSession()) return null;
  const res = await authFetch("/api/me");
  if (!res.ok) {
    if (res.status === 401) clearSession();
    return null;
  }
  const account = (await res.json()) as Account;
  store()?.setItem(ACCOUNT, JSON.stringify(account));
  return account;
}

export interface WalletChallenge {
  message: string;
  nonce: string;
  expiresAt: number;
}

// Wallet sign-in, the console's only door: the backend hands out the exact text to sign,
// the wallet signs it (EIP-191 personal_sign), and the backend answers with a session
// whose identity is the address. The address is linked as a treasury address on the way.
export async function walletChallenge(address: string): Promise<WalletChallenge> {
  const res = await fetch(`${API_BASE}/api/auth/wallet/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Could not start wallet sign-in (${res.status})`);
  }
  return (await res.json()) as WalletChallenge;
}

export async function signInWithWallet(address: string, nonce: string, signature: string): Promise<Account> {
  const res = await fetch(`${API_BASE}/api/auth/wallet`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, nonce, signature }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Wallet sign-in failed (${res.status})`);
  }
  const grant = (await res.json()) as SessionGrant;
  saveSession(grant);
  return grant.account;
}

export async function signOut(): Promise<void> {
  try {
    await authFetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Best effort: even if the revoke call fails, drop the local session below.
  }
  clearSession();
}

export function accountName(account: Account | null): string {
  if (!account) return "";
  const full = [account.givenName, account.familyName].filter(Boolean).join(" ").trim();
  return full || account.email || "Recourse account";
}

export function accountInitials(account: Account | null): string {
  if (!account) return "RC";
  const first = account.givenName?.charAt(0) ?? account.email?.charAt(0) ?? "R";
  const second = account.familyName?.charAt(0) ?? "";
  return `${first}${second}`.toUpperCase();
}
