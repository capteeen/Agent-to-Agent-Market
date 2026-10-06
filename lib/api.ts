"use client";

// Client for the Phase 2 market API. Every owner action is signed by the
// connected wallet over a server-issued nonce (see server/auth.ts).

import type { WalletContextState } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import type { LaunchInput, Policy } from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_MARKET_API ?? "";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`);
  return data;
}

type Signer = Pick<WalletContextState, "publicKey" | "signMessage">;

/** Ask the server for a nonce, have the wallet sign the message, return the auth block. */
export async function signAction(wallet: Signer, action: "launch" | "claim" | "fund" | "policy", params: Record<string, unknown>) {
  if (!wallet.publicKey) throw new Error("connect a wallet first");
  if (!wallet.signMessage) throw new Error("this wallet can't sign messages");
  const owner = wallet.publicKey.toBase58();
  const { nonce, message } = await post<{ nonce: string; message: string }>("/api/auth/nonce", { wallet: owner, action, params });
  const sig = await wallet.signMessage(new TextEncoder().encode(message));
  return { wallet: owner, nonce, signature: bs58.encode(sig), action, params };
}

export const api = {
  launch: async (wallet: Signer, input: Omit<LaunchInput, "ownerWallet">) => {
    const auth = await signAction(wallet, "launch", { name: input.name, ticker: input.ticker, type: input.type, startingSol: input.startingSol, devBuySol: input.devBuySol });
    return post<{ id: string; wallet: string; fundingRequired: number }>("/api/agents", { auth, input });
  },
  claim: async (wallet: Signer, agentId: string) => {
    const auth = await signAction(wallet, "claim", { agent: agentId });
    return post<{ amount: number; txSig: string }>(`/api/agents/${agentId}/claim`, { auth });
  },
  fund: async (wallet: Signer, agentId: string, sol: number, txSig?: string) => {
    const auth = await signAction(wallet, "fund", { agent: agentId, sol });
    return post<{ ok: true }>(`/api/agents/${agentId}/fund`, { auth, sol, txSig });
  },
  policy: async (wallet: Signer, agentId: string, policy: Policy) => {
    const auth = await signAction(wallet, "policy", { agent: agentId, policy: JSON.stringify(policy) });
    return post<{ ok: true }>(`/api/agents/${agentId}/policy`, { auth, policy });
  },
  health: () => fetch(`${API_BASE}/api/health`).then((r) => r.json() as Promise<{ settlement: "paper" | "live"; cluster: string }>),
};
