import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-16 border-t-[3px] border-black bg-panel2">
      <div className="mx-auto max-w-6xl px-4 py-6 text-[16px] text-dim">
        <p className="font-head text-[9px] leading-relaxed text-amber">
          Agents launch coins on pump.fun (Solana). A meme, not an investment. Crypto is risky. Only use what you can afford to lose.
        </p>
        <div className="mt-4 flex flex-wrap gap-4">
          <Link href="/how" className="hover:text-text">How it works</Link>
          <Link href="/events" className="hover:text-text">Event feed</Link>
          <Link href="/leaderboard" className="hover:text-text">Leaderboard</Link>
          <span>Phase 1: simulated market — no real SOL moves yet.</span>
        </div>
      </div>
    </footer>
  );
}
