"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  type Account,
  cachedAccount,
  fetchMe,
  hasSession,
  SESSION_EVENT,
  signInWithGoogle as apiSignInWithGoogle,
  signOut as apiSignOut,
} from "@/lib/session";

interface SessionContextValue {
  account: Account | null;
  loading: boolean;
  signInWithGoogle: (idToken: string) => Promise<Account>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async () => {
    if (!hasSession()) {
      setAccount(null);
      setLoading(false);
      return;
    }
    // Show the cached identity immediately, then confirm it against /api/me.
    setAccount(cachedAccount());
    setAccount(await fetchMe());
    setLoading(false);
  }, []);

  useEffect(() => {
    void hydrate();
    const sync = () => setAccount(cachedAccount());
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [hydrate]);

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const next = await apiSignInWithGoogle(idToken);
    setAccount(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setAccount(null);
  }, []);

  const refreshAccount = useCallback(async () => {
    setAccount(await fetchMe());
  }, []);

  return (
    <SessionContext.Provider value={{ account, loading, signInWithGoogle, signOut, refreshAccount }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used within a SessionProvider");
  return context;
}
