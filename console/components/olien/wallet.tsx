"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { useCallback, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage, useSwitchChain } from "wagmi";
import { useSession } from "@/components/session-provider";
import { arcTestnet } from "@/lib/contracts";
import { signInWithWallet, walletChallenge } from "@/lib/session";
import { errorMessage, sameAddress, shortAddress, type AccountView, type SignerView } from "@/lib/treasury";
import { Button, InlineError } from "./ui";
import { olienKeys } from "./use-olien";

// The console's identity is one wallet: the session names the address that signed in,
// and the connected wallet must be that same address before anything is signed.
export function useWalletSession() {
  const { account: session, loading, signOut } = useSession();
  const { address, status, chainId } = useAccount();
  const sessionAddress = session?.provider === "wallet" ? session.providerUserId : null;
  const connected = status === "connected" && Boolean(address);
  // "connecting" is a wallet prompt the member opened; only the session hydration and
  // wagmi's own reconnect count as settling, so the sign-in card keeps its errors.
  const settling = loading || status === "reconnecting";
  const matches = connected && sessionAddress ? sameAddress(address, sessionAddress) : false;
  return { session, sessionAddress, address: address ?? null, connected, settling, matches, chainId, signOut };
}

export function useSignIn() {
  const queryClient = useQueryClient();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(
    async (address: string) => {
      setError(null);
      setBusy(true);
      try {
        const lower = address.toLowerCase();
        const challenge = await walletChallenge(lower);
        const signature = await signMessageAsync({ message: challenge.message });
        await signInWithWallet(lower, challenge.nonce, signature);
        await queryClient.invalidateQueries({ queryKey: olienKeys.all });
        return true;
      } catch (cause) {
        setError(friendlyWalletError(cause));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [queryClient, signMessageAsync],
  );

  return { signIn, busy, error };
}

// Switches the wallet to Arc testnet before any signature or transaction.
export function useArcChain() {
  const { chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  return useCallback(async () => {
    if (chainId !== arcTestnet.id) await switchChainAsync({ chainId: arcTestnet.id });
  }, [chainId, switchChainAsync]);
}

export function walletSigner(account: AccountView, address: string | null | undefined): SignerView | null {
  if (!address) return null;
  return account.signers.find((signer) => signer.kind === "ecdsa" && sameAddress(signer.address, address)) ?? null;
}

export function friendlyWalletError(cause: unknown): string {
  const text = errorMessage(cause);
  if (/user rejected|user denied|rejected the request/i.test(text)) return "The wallet declined. Nothing was signed.";
  if (/provider not found|no injected|not detected/i.test(text)) return "No wallet found. Install MetaMask or Rabby, then reload this page.";
  return text;
}

function ConnectButton({ label = "Connect wallet" }: { label?: string }) {
  const { connect, connectors, isPending, error } = useConnect();
  const injected = connectors[0];
  return (
    <>
      <Button variant="primary" icon={<Wallet size={15} />} busy={isPending} disabled={!injected} onClick={() => injected && connect({ connector: injected })}>
        {label}
      </Button>
      {!injected ? <InlineError message="No wallet found. Install MetaMask or Rabby, then reload this page." /> : null}
      {error ? <InlineError message={friendlyWalletError(error)} /> : null}
    </>
  );
}

// Squads' door: connect first, sign a message to prove the address, then everything else.
export function SignInCard({ mode }: { mode: "signin" | "reconnect" }) {
  const { address, connected, sessionAddress, signOut } = useWalletSession();
  const { disconnect } = useDisconnect();
  const { signIn, busy, error } = useSignIn();

  return (
    <div className="olien-gate">
      <div className="olien-gate-card">
        <div className="olien-wordmark">
          Olien<span className="olien-dot" aria-hidden />
        </div>
        {mode === "reconnect" ? (
          <>
            <h1>Reconnect your wallet</h1>
            <p>
              You are signed in as <code>{sessionAddress ? shortAddress(sessionAddress) : "a wallet"}</code>. Signing needs that wallet connected.
            </p>
            <ConnectButton label="Connect wallet" />
            <button type="button" className="olien-link-btn" onClick={() => void signOut()}>
              Sign out
            </button>
          </>
        ) : !connected || !address ? (
          <>
            <h1>Connect a wallet to open Olien</h1>
            <p>MetaMask, Rabby and other browser wallets work.</p>
            <ConnectButton />
          </>
        ) : (
          <>
            <h1>Connect a wallet to open Olien</h1>
            <p>
              Connected as <code>{shortAddress(address)}</code>. Sign a message to prove you hold it.
            </p>
            <Button variant="primary" busy={busy} onClick={() => void signIn(address)}>
              {busy ? "Check your wallet" : `Sign in with ${shortAddress(address)}`}
            </Button>
            <InlineError message={error} />
            <button type="button" className="olien-link-btn" onClick={() => disconnect()}>
              Use another wallet
            </button>
          </>
        )}
      </div>
      <p className="olien-gate-hint">Your wallet is your identity. Signing proves you hold it; it never moves money.</p>
    </div>
  );
}

export function MismatchBanner() {
  const { address } = useWalletSession();
  const { signIn, busy, error } = useSignIn();
  if (!address) return null;
  return (
    <div className="olien-banner" role="alert">
      <span>
        Connected wallet <code>{shortAddress(address)}</code> is not the one you signed in with. Sign in with this wallet instead.
      </span>
      <Button variant="primary" size="sm" busy={busy} onClick={() => void signIn(address)}>
        Sign in with {shortAddress(address)}
      </Button>
      <InlineError message={error} />
    </div>
  );
}
