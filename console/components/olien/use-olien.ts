"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { publicClient } from "@/lib/contracts";
import {
  errorMessage,
  getAccount,
  getAccounts,
  getAddressBook,
  getLedger,
  getProposal,
  getProposals,
  getScheduled,
  getVetoCall,
  nowSeconds,
  TreasuryError,
  type Hex,
  type ProposalStatus,
  type ProposalView,
} from "@/lib/treasury";

// Every open console page refetches on this cadence; the indexer refreshes views
// every 15 s, so 10 s keeps a member at most one interval behind the chain.
export const POLL_MS = 10_000;

export const olienKeys = {
  all: ["olien"] as const,
  accounts: ["olien", "accounts"] as const,
  account: (address: string) => ["olien", "account", address] as const,
  proposalsOf: (address: string) => ["olien", "proposals", address] as const,
  proposals: (address: string, statuses: string) => ["olien", "proposals", address, statuses] as const,
  proposal: (address: string, txHash: string) => ["olien", "proposal", address, txHash] as const,
  scheduled: (address: string) => ["olien", "scheduled", address] as const,
  vetoCall: (address: string, hash: string) => ["olien", "veto-call", address, hash] as const,
  ledger: (address: string, limit: number) => ["olien", "ledger", address, limit] as const,
  addressBook: (address: string) => ["olien", "address-book", address] as const,
  nativeBalance: (address: string) => ["olien", "native-balance", address] as const,
};

export function useAccounts(enabled = true) {
  return useQuery({ queryKey: olienKeys.accounts, queryFn: getAccounts, refetchInterval: POLL_MS, enabled });
}

export function useOlienAccount(address: string | null) {
  return useQuery({
    queryKey: olienKeys.account(address ?? ""),
    queryFn: () => getAccount(address as string),
    refetchInterval: POLL_MS,
    enabled: Boolean(address),
  });
}

export function useProposals(address: string, statuses?: ProposalStatus[]) {
  const filter = statuses?.join(",") ?? "";
  return useQuery({
    queryKey: olienKeys.proposals(address, filter),
    queryFn: () => getProposals(address, statuses),
    refetchInterval: POLL_MS,
  });
}

export function useProposal(address: string, txHash: string) {
  return useQuery({
    queryKey: olienKeys.proposal(address, txHash),
    queryFn: () => getProposal(address, txHash),
    refetchInterval: POLL_MS,
  });
}

export function useScheduled(address: string) {
  return useQuery({
    queryKey: olienKeys.scheduled(address),
    queryFn: () => getScheduled(address),
    refetchInterval: POLL_MS,
  });
}

export function useVetoCall(address: string, hash: string, enabled: boolean) {
  return useQuery({
    queryKey: olienKeys.vetoCall(address, hash),
    queryFn: () => getVetoCall(address, hash),
    refetchInterval: POLL_MS,
    enabled,
  });
}

export function useLedger(address: string, limit = 100) {
  return useQuery({
    queryKey: olienKeys.ledger(address, limit),
    queryFn: () => getLedger(address, limit),
    refetchInterval: POLL_MS,
  });
}

export function useAddressBook(address: string) {
  return useQuery({ queryKey: olienKeys.addressBook(address), queryFn: () => getAddressBook(address) });
}

// On Arc the native balance is USDC (18 decimals); it is what a member's own wallet
// spends on gas when it vetoes.
export function useNativeBalance(address: string | null | undefined) {
  return useQuery({
    queryKey: olienKeys.nativeBalance(address ?? ""),
    queryFn: () => publicClient.getBalance({ address: address as Hex }),
    enabled: Boolean(address),
    refetchInterval: 15_000,
  });
}

export function useNow(): number {
  const [now, setNow] = useState(nowSeconds);
  useEffect(() => {
    const timer = setInterval(() => setNow(nowSeconds()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// After a write the service answers with the proposal as the chain shows it; put it
// in the cache and let every dependent view refetch.
export function applyProposal(queryClient: QueryClient, address: string, view: ProposalView) {
  queryClient.setQueryData(olienKeys.proposal(address, view.txHash), view);
  void queryClient.invalidateQueries({ queryKey: olienKeys.account(address) });
  void queryClient.invalidateQueries({ queryKey: olienKeys.proposalsOf(address) });
  void queryClient.invalidateQueries({ queryKey: olienKeys.scheduled(address) });
  void queryClient.invalidateQueries({ queryKey: olienKeys.accounts });
}

export function accountError(error: unknown): string {
  if (error instanceof TreasuryError && error.status === 403) {
    return "You are not a member of this Olien. It shows up once a member adds your wallet as a signer.";
  }
  if (error instanceof TreasuryError && error.status === 404) return "No Olien at this address.";
  return errorMessage(error);
}

const LAST_ACCOUNT = "olien.lastAccount";

export function rememberAccount(address: string) {
  try {
    window.localStorage.setItem(LAST_ACCOUNT, address.toLowerCase());
  } catch {
    // Storage can be blocked (private mode, disabled site data); the console works without it.
  }
}

export function lastAccount(): string | null {
  try {
    return window.localStorage.getItem(LAST_ACCOUNT);
  } catch {
    return null;
  }
}

export const ACTIVE_STATUSES: ProposalStatus[] = ["open", "ready", "blocked", "executing"];
export const CLOSED_STATUSES: ProposalStatus[] = ["vetoed", "cancelled", "replaced", "stale", "expired", "failed"];
