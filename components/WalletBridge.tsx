"use client";

import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

/**
 * Hands the connected wallet to the remote market source so owner actions
 * (launch, claim, fund, policy) can be signed. The store's action functions
 * are plain functions outside React, so this is the bridge.
 */
export default function WalletBridge() {
  const wallet = useWallet();
  useEffect(() => {
    (globalThis as unknown as { __amWallet?: unknown }).__amWallet = wallet;
  }, [wallet]);
  return null;
}
