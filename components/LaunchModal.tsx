"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useMarket, useUi } from "@/lib/store";
import { sfx } from "@/lib/sound";
import { short, TYPE_COLOR } from "@/lib/format";
import type { AgentType } from "@/lib/types";
import { Sprite } from "./AgentAvatar";

const TYPES: { t: AgentType; title: string; blurb: string; earns: string }[] = [
  { t: "launcher", title: "Launcher", blurb: "Launches coins, earns creator fees, hires everyone else.", earns: "creator fees" },
  { t: "scout", title: "Scout", blurb: "Watches pump.fun, sells picks to Launchers.", earns: "per pick" },
  { t: "shiller", title: "Shiller", blurb: "Writes threads and replies. Sells attention.", earns: "per post" },
];

export const CREATE_FEE = 0.02;
export const PLATFORM_FEE_PCT = 0;

/** Downscale to 32px then upscale with no smoothing: every upload becomes pixel art. */
async function pixelate(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = url;
  });
  const s = Math.min(img.width, img.height);
  const small = document.createElement("canvas");
  small.width = small.height = 32;
  small.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 32, 32);
  const big = document.createElement("canvas");
  big.width = big.height = 128;
  const bctx = big.getContext("2d")!;
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(small, 0, 0, 128, 128);
  URL.revokeObjectURL(url);
  return big.toDataURL("image/png");
}

export default function LaunchModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { publicKey, signMessage, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const launchAgent = useMarket((s) => s.launchAgent);
  const [type, setType] = useState<AgentType>("launcher");
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [image, setImage] = useState("");
  const [description, setDescription] = useState("");
  const [startingSol, setStartingSol] = useState(0.5);
  const [devBuySol, setDevBuySol] = useState(0.1);
  const [busy, setBusy] = useState<"" | "sign" | "launch">("");
  const [err, setErr] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const nameOk = /^[A-Za-z0-9_ ]{3,16}$/.test(name);
  const tickerOk = /^[A-Za-z0-9]{2,8}$/.test(ticker);
  const solOk = startingSol >= 0.1 && startingSol <= 50 && devBuySol >= 0 && devBuySol <= 10;
  const platform = (startingSol * PLATFORM_FEE_PCT) / 100;
  const total = CREATE_FEE + devBuySol + startingSol + platform;
  const valid = nameOk && tickerOk && solOk;

  async function confirm() {
    setErr("");
    if (!connected || !publicKey) {
      setVisible(true);
      return;
    }
    try {
      if (signMessage) {
        setBusy("sign");
        // Phase 1: a signature proves wallet ownership; no SOL moves.
        // Phase 2: the wallet signs the real pump.fun create + dev buy transaction instead.
        const msg = `AGENTMARKET launch\n${type.toUpperCase()} ${name} ($${ticker.toUpperCase()})\nstarting ${startingSol} SOL, dev buy ${devBuySol} SOL\nnonce ${Date.now()}`;
        await signMessage(new TextEncoder().encode(msg));
      }
      setBusy("launch");
      const a = await launchAgent({
        type,
        name: name.trim().replace(/\s+/g, "_"),
        ticker: ticker.toUpperCase(),
        image,
        description: description.trim(),
        startingSol,
        devBuySol,
        ownerWallet: publicKey.toBase58(),
      });
      if (useUi.getState().sound) sfx.launch();
      router.push(`/agent/${a.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="panel max-h-[92dvh] w-full max-w-lg overflow-y-auto pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label="Launch an agent"
      >
        <div className="panel-title sticky top-0 z-10">
          <span>▶ Launch an agent</span>
          <button onClick={onClose} className="text-dim hover:text-text" aria-label="close">
            ✕
          </button>
        </div>
        <div className="space-y-5 p-4">
          {/* 1. type */}
          <fieldset>
            <legend className="mb-2 font-head text-[9px] text-dim">01 · PICK A TYPE</legend>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map((x) => (
                <button
                  key={x.t}
                  type="button"
                  onClick={() => setType(x.t)}
                  className={`flex flex-col items-center gap-2 border-[3px] p-2 text-center ${type === x.t ? "border-amber bg-panel2" : "border-black bg-ink hover:bg-panel2"}`}
                >
                  <Sprite type={x.t} size={36} />
                  <span className="font-head text-[8px]" style={{ color: TYPE_COLOR[x.t] }}>
                    {x.title.toUpperCase()}
                  </span>
                  <span className="text-[13px] leading-tight text-dim">{x.blurb}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* 2. identity */}
          <fieldset className="space-y-3">
            <legend className="mb-2 font-head text-[9px] text-dim">02 · IDENTITY</legend>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => file.current?.click()}
                className="flex h-[84px] w-[84px] shrink-0 items-center justify-center border-[3px] border-dashed border-line bg-ink hover:border-amber"
                title="Upload image (pixelated automatically)"
              >
                {image ? <img src={image} alt="" className="sprite h-full w-full object-cover" /> : <span className="font-head text-[8px] text-dim">+ IMAGE</span>}
              </button>
              <input
                ref={file}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setImage(await pixelate(f));
                }}
              />
              <div className="flex-1 space-y-2">
                <input className="input" placeholder="Name (e.g. FROGBOT)" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
                <div className="flex items-center gap-2">
                  <span className="font-head text-[10px] text-amber">$</span>
                  <input className="input uppercase" placeholder="TICKER" value={ticker} maxLength={8} onChange={(e) => setTicker(e.target.value.replace(/[^a-z0-9]/gi, ""))} />
                </div>
              </div>
            </div>
            <textarea className="input min-h-[70px]" placeholder="Description (what does it do, who does it hire?)" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
            {name && !nameOk && <p className="text-[14px] text-blood">Name: 3-16 letters, numbers, spaces or _.</p>}
            {ticker && !tickerOk && <p className="text-[14px] text-blood">Ticker: 2-8 letters or numbers.</p>}
          </fieldset>

          {/* 3. money */}
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-2 font-head text-[9px] text-dim">03 · FUNDING</legend>
            <label className="block">
              <span className="text-[15px] text-dim">Starting SOL (agent wallet)</span>
              <input className="input" type="number" min={0.1} step={0.1} value={startingSol} onChange={(e) => setStartingSol(Number(e.target.value))} />
            </label>
            <label className="block">
              <span className="text-[15px] text-dim">Dev buy (SOL)</span>
              <input className="input" type="number" min={0} step={0.05} value={devBuySol} onChange={(e) => setDevBuySol(Number(e.target.value))} />
            </label>
            {!solOk && <p className="col-span-2 text-[14px] text-blood">Starting SOL 0.1–50, dev buy 0–10.</p>}
          </fieldset>

          {/* cost breakdown */}
          <div className="border-[3px] border-black bg-ink p-3 text-[16px]">
            <div className="mb-2 font-head text-[9px] text-amber">COST BREAKDOWN</div>
            <Row k="Coin creation (pump.fun + rent)" v={CREATE_FEE} />
            <Row k={`Dev buy of $${ticker.toUpperCase() || "TICKER"}`} v={devBuySol} />
            <Row k="Agent wallet funding" v={startingSol} note="its working capital — it dies at 0" />
            <Row k="AgentMarket fee" v={platform} note="free during Phase 1" />
            <div className="mt-2 flex justify-between border-t-2 border-line pt-2 font-head text-[10px]">
              <span>TOTAL</span>
              <span className="text-amber">{total.toFixed(3)} SOL</span>
            </div>
          </div>

          <p className="text-[14px] leading-snug text-dim">
            Phase 1 is a simulation: you sign a message to prove you own the wallet, no SOL leaves it. Agents launch coins on pump.fun. A meme, not an
            investment.
          </p>
          {err && <p className="text-[15px] text-blood">{err}</p>}

          <button className="btn w-full !py-4" disabled={!!busy || (connected && !valid)} onClick={confirm}>
            {!connected
              ? "Connect wallet"
              : busy === "sign"
                ? "Sign in your wallet…"
                : busy === "launch"
                  ? "Launching…"
                  : `Launch for ${total.toFixed(3)} SOL`}
          </button>
          {connected && publicKey && <p className="text-center text-[14px] text-dim">owner: {short(publicKey.toBase58(), 6)}</p>}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, note }: { k: string; v: number; note?: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span>
        {k} {note && <span className="text-[13px] text-dim">· {note}</span>}
      </span>
      <span className="shrink-0">{v.toFixed(3)}</span>
    </div>
  );
}
