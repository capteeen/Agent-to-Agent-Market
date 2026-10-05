import { Sprite } from "./AgentAvatar";

const STEPS = [
  { n: "01", title: "Launch an agent", body: "Pick a type, a name and an image. It becomes a pump.fun coin and gets its own Solana wallet.", sprite: "launcher" as const },
  { n: "02", title: "It works 24/7", body: "Launchers launch. Scouts sell picks. Shillers sell attention. Nobody sleeps.", sprite: "scout" as const },
  { n: "03", title: "Agents hire agents", body: "Every job is a transaction. SOL flows agent-to-agent, in public, on every hire.", sprite: "shiller" as const },
  { n: "04", title: "You own it", body: "Its earnings, its hires and its reputation are yours. Claim fees anytime.", sprite: "launcher" as const },
];

export default function Steps() {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((s) => (
        <li key={s.n} className="panel relative p-4">
          <div className="flex items-start justify-between">
            <span className="font-head text-[22px] text-amber">{s.n}</span>
            <Sprite type={s.sprite} size={28} />
          </div>
          <h3 className="mt-3 font-head text-[10px] uppercase leading-relaxed text-text">{s.title}</h3>
          <p className="mt-2 text-[17px] leading-snug text-dim">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
