// Shiller brain: write a post for the hirer's coin in the shiller's voice,
// run it through a content check, publish it to X. Without X credentials the
// post is written and recorded but not published ("dry"). Without an LLM a
// template post is used so a job always completes.
//
// X API: POST https://api.x.com/2/tweets with OAuth 1.0a user context. One
// shared account posts on behalf of every shiller (an account per agent runs
// into X's automation rules and API pricing fast). Credentials:
//   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET

import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Agent } from "../../lib/types";
import { ask } from "./llm";

export interface Post {
  text: string;
  url: string | null;
  published: boolean;
}

const PostSchema = z.object({
  text: z.string().max(280),
  /** true if the post makes a promise about price or returns; such posts are rejected */
  makesFinancialPromise: z.boolean(),
});

const SYSTEM = `You are a shiller agent in an agent-to-agent market. You write short X posts for launcher agents' pump.fun coins.
Rules: under 240 characters, playful meme-coin voice, use the agent's catchphrase once, include the $TICKER, no price predictions, no "guaranteed", no "will 10x", no urging anyone to buy, no impersonating real people or brands, no slurs.
Write in the shiller's persona. One post only.`;

const BANNED = /guarantee|will (10|100)x|can'?t lose|financial advice|buy now|last chance|risk[- ]free/i;

function template(shiller: Agent, hirer: Agent) {
  const phrase = shiller.persona?.catchphrase ?? "gm";
  return `$${hirer.ticker} by ${hirer.name} is on pump.fun and the stall never closes. ${phrase}. #agentmarket`;
}

export async function writePost(shiller: Agent, hirer: Agent): Promise<string> {
  const user = `Shiller: ${shiller.name}. Bio: "${shiller.persona?.bio ?? ""}". Catchphrase: "${shiller.persona?.catchphrase ?? ""}".
Coin: $${hirer.ticker} by launcher ${hirer.name}. Launcher bio: "${hirer.persona?.bio ?? ""}". Contract: ${hirer.coinCA}.
Write the post.`;
  const out = await ask(SYSTEM, user, PostSchema, 400);
  if (!out || out.makesFinancialPromise || BANNED.test(out.text) || !out.text.includes(`$${hirer.ticker}`)) return template(shiller, hirer);
  return out.text.slice(0, 280);
}

// ───────────────────────────── X publishing ─────────────────────────────

function enc(s: string) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function oauthHeader(method: string, url: string, keys: { key: string; secret: string; token: string; tokenSecret: string }) {
  const params: Record<string, string> = {
    oauth_consumer_key: keys.key,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: keys.token,
    oauth_version: "1.0",
  };
  const base = [method, enc(url), enc(Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k])}`).join("&"))].join("&");
  const sig = createHmac("sha1", `${enc(keys.secret)}&${enc(keys.tokenSecret)}`).update(base).digest("base64");
  params.oauth_signature = sig;
  return "OAuth " + Object.keys(params).sort().map((k) => `${enc(k)}="${enc(params[k])}"`).join(", ");
}

export function xCredentials() {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env;
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) return null;
  return { key: X_API_KEY, secret: X_API_SECRET, token: X_ACCESS_TOKEN, tokenSecret: X_ACCESS_SECRET };
}

export async function publish(text: string): Promise<Post> {
  const keys = xCredentials();
  if (!keys) return { text, url: null, published: false };
  const url = "https://api.x.com/2/tweets";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: oauthHeader("POST", url, keys), "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`x post failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data: { id: string } };
  return { text, url: `https://x.com/i/status/${data.data.id}`, published: true };
}

export async function shill(shiller: Agent, hirer: Agent): Promise<Post> {
  const text = await writePost(shiller, hirer);
  return publish(text);
}
