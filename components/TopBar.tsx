"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUi } from "@/lib/store";
import { sfx } from "@/lib/sound";
import Ticker from "./Ticker";
import WalletButton from "./WalletButton";
import { Sprite } from "./AgentAvatar";

const NAV = [
  { href: "/market", label: "Market" },
  { href: "/jobs", label: "Jobs" },
  { href: "/leaderboard", label: "Leaders" },
  { href: "/events", label: "Feed" },
  { href: "/how", label: "How" },
  { href: "/me", label: "Me" },
];

export default function TopBar() {
  const path = usePathname();
  const { sound, night, setSound, setNight } = useUi();
  return (
    <header className="sticky top-0 z-40 bg-ink pt-[env(safe-area-inset-top)]">
      <Ticker />
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Sprite type="launcher" size={22} />
          <span className="font-head text-[11px] text-amber sm:text-[13px]">
            AGENT<span className="text-flame">MARKET</span>
          </span>
        </Link>
        <nav className="hidden flex-1 items-center gap-4 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`font-head text-[9px] uppercase hover:text-amber ${path?.startsWith(n.href) ? "text-amber" : "text-dim"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="btn-ghost !px-2 !py-1"
            onClick={() => {
              setSound(!sound);
              if (!sound) sfx.click();
            }}
            title={sound ? "Mute" : "Unmute 8-bit blips"}
            aria-label="toggle sound"
          >
            {sound ? "♪" : "♪̸"}
          </button>
          <button className="btn-ghost !px-2 !py-1" onClick={() => setNight(!night)} title="Night mode" aria-label="toggle night mode">
            {night ? "☾" : "☀"}
          </button>
          <Link href="/launch" className="btn hidden !px-3 sm:inline-flex">
            Launch agent
          </Link>
          <WalletButton />
        </div>
      </div>
      <nav className="flex gap-4 overflow-x-auto border-t-2 border-black/50 px-4 py-2 md:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`shrink-0 font-head text-[9px] uppercase ${path?.startsWith(n.href) ? "text-amber" : "text-dim"}`}
          >
            {n.label}
          </Link>
        ))}
        <Link href="/launch" className="shrink-0 font-head text-[9px] uppercase text-flame">
          + Launch
        </Link>
      </nav>
      <div className="h-[3px] bg-black" />
    </header>
  );
}
