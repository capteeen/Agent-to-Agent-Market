"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";
import { useMarket, useUi } from "@/lib/store";
import { createSource } from "@/lib/source";
import { sfx } from "@/lib/sound";
import { BellOverlay } from "./MarketReport";

function Boot() {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    try {
      useUi.setState({
        sound: localStorage.getItem("am.sound") === "1",
        night: localStorage.getItem("am.night") !== "0",
      });
    } catch {}
    const stop = createSource().start();
    return () => {
      // keep the sim alive across fast-refresh/StrictMode double mounts
      if (process.env.NODE_ENV === "production") stop();
    };
  }, []);
  return null;
}

/** Ships uncaught errors to /api/log so a canvas crash on some phone is visible. */
function ErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const send = (kind: string, message: string, stack?: string) => {
      if (sent++ > 5) return;
      try {
        navigator.sendBeacon?.("/api/log", JSON.stringify({ kind, message, stack, url: location.href, ua: navigator.userAgent, at: Date.now() }));
      } catch {}
    };
    const onErr = (e: ErrorEvent) => send("error", e.message, e.error?.stack);
    const onRej = (e: PromiseRejectionEvent) => send("unhandledrejection", String(e.reason?.message ?? e.reason), e.reason?.stack);
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);
  return null;
}

function Theme() {
  const night = useUi((s) => s.night);
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("dark", night);
    el.classList.toggle("light", !night);
  }, [night]);
  return null;
}

function SoundFx() {
  const last = useRef<string | null>(null);
  useEffect(
    () =>
      useMarket.subscribe((s) => {
        const e = s.events[0];
        if (!e || e.id === last.current) return;
        const first = last.current === null;
        last.current = e.id;
        if (first || !useUi.getState().sound) return;
        if (e.kind === "hire") sfx.hire();
        else if (e.kind === "job_done") sfx.coin();
        else if (e.kind === "launch") sfx.launch();
        else if (e.kind === "death") sfx.death();
      }),
    [],
  );
  return null;
}

export default function Providers({ children }: { children: ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC ?? clusterApiUrl("mainnet-beta");
  // Backpack (and any other Wallet Standard wallet) is auto-detected.
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Boot />
          <ErrorReporter />
          <Theme />
          <SoundFx />
          <BellOverlay onRing={() => useUi.getState().sound && sfx.bell()} />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
