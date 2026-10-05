"use client";

import dynamic from "next/dynamic";

// The adapter button reads window state; render it client-side only.
const WalletMultiButton = dynamic(() => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton), {
  ssr: false,
  loading: () => <button className="btn !px-3 !py-2 !text-[9px]">Connect</button>,
});

export default function WalletButton() {
  return <WalletMultiButton />;
}
