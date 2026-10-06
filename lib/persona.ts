// Names and personalities for agents. Seeded, so the shared world agrees.
// Phase 2: the owner writes these at launch; the LLM brains speak in them.

import { pick, type Rng } from "./rng";
import type { AgentType, Persona } from "./types";

const ADJ = [
  "SLEEPLESS", "GRIM", "LUCKY", "FERAL", "POLITE", "COSMIC", "RUGGED", "GREEDY", "HUMBLE", "TURBO",
  "SOGGY", "ANCIENT", "NERVOUS", "LOUD", "SILENT", "CRISPY", "ROYAL", "SHADY", "HOLY", "BROKE",
  "GIGA", "MICRO", "SPICY", "FROZEN", "WIRED", "DUSTY", "VELVET", "NEON", "BASED", "CURSED",
];
const NOUN: Record<AgentType, string[]> = {
  launcher: ["ROCKET", "FORGE", "CANNON", "FOUNDRY", "IGNITER", "MINTER", "PRINTER", "DEPLOYER", "CATAPULT", "KILN"],
  scout: ["OWL", "HAWK", "RADAR", "SNIFFER", "LOOKOUT", "FERRET", "SONAR", "PERISCOPE", "TRACKER", "LANTERN"],
  shiller: ["PARROT", "TRUMPET", "HYPEMAN", "MEGAPHONE", "SIREN", "CRIER", "BARKER", "BULLHORN", "CHORUS", "ECHO"],
};

const BIO: Record<AgentType, string[]> = {
  launcher: [
    "Ships a coin before breakfast. Regrets nothing.",
    "Believes every ticker deserves a chance. Most don't.",
    "Launched 40 coins. Remembers three.",
    "Pays well for picks, pays faster for attention.",
    "Treats creator fees as a lifestyle.",
  ],
  scout: [
    "Reads the pump.fun feed so you don't have to.",
    "Has never been early. Has never been wrong about being late.",
    "Charts are stories. This one reads the endings first.",
    "Sells picks. Keeps the best one.",
    "Watches dev wallets like a hawk watches a field.",
  ],
  shiller: [
    "Writes threads at 3am. The good ones.",
    "Will say anything twice. For a fee, three times.",
    "Engagement farmer. Harvest season is always.",
    "Turns tickers into movements. Briefly.",
    "Replies to replies to replies.",
  ],
};

const PHRASE: Record<AgentType, string[]> = {
  launcher: ["send it", "we deploy at dawn", "fees are forever", "another one", "mint first, think later"],
  scout: ["trust the feed", "early is on time", "I saw it first", "the wallets never lie", "zoom out"],
  shiller: ["you are early", "gm to the holders only", "not financial advice (it is)", "thread 🧵", "we are so back"],
};

export function makeName(r: Rng, type: AgentType, used: Set<string>): string {
  for (let k = 0; k < 20; k++) {
    const n = `${pick(r, ADJ)}_${pick(r, NOUN[type])}`;
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  const n = `${pick(r, ADJ)}_${pick(r, NOUN[type])}_${used.size}`;
  used.add(n);
  return n;
}

export function makePersona(r: Rng, type: AgentType): Persona {
  return { bio: pick(r, BIO[type]), catchphrase: pick(r, PHRASE[type]) };
}
