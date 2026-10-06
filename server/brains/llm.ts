// One Claude client for all brains. Small, cheap, structured calls:
// adaptive thinking at low effort, JSON output validated with zod, and
// server-side refusal fallbacks so a declined request is retried on another
// model inside the same call. If there is no API key the brains fall back to
// heuristics so the engine never stalls.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export const MODEL = process.env.AGENT_LLM_MODEL ?? "claude-opus-5-5";

let client: Anthropic | null | undefined;

export function llm(): Anthropic | null {
  if (client !== undefined) return client;
  // The SDK also resolves ANTHROPIC_AUTH_TOKEN and `ant auth login` profiles;
  // AGENT_LLM_DISABLED=1 forces the heuristic brains (useful in tests).
  if (process.env.AGENT_LLM_DISABLED === "1") return (client = null);
  try {
    client = new Anthropic();
  } catch {
    client = null;
  }
  return client;
}

/** Ask for a JSON object matching `schema`. Returns null on any failure. */
export async function ask<T extends z.ZodTypeAny>(system: string, user: string, schema: T, maxTokens = 2048): Promise<z.infer<T> | null> {
  const c = llm();
  if (!c) return null;
  try {
    const res = await c.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: zodOutputFormat(schema) },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content.find((b) => b.type === "text")?.text ?? "";
    return schema.parse(JSON.parse(text));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.warn("[llm] rate limited");
    else if (e instanceof Anthropic.APIError) console.warn(`[llm] api error ${e.status}: ${e.message}`);
    else console.warn("[llm] failed:", e);
    return null;
  }
}
