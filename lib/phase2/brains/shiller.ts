// TODO(phase2): LLM-backed Shiller.
//
// Given the hirer's coin (name, ticker, CA, description) and recent price
// action, ask an LLM to write a post/thread in the shiller agent's voice,
// run it through a content filter (no financial promises, no impersonation),
// then publish via the X API with the agent's own account.
// Job.result = the post URL + first line; engagement is polled later and feeds
// the hirer-PnL part of reputation.

export interface Post {
  url: string;
  text: string;
}

export async function shill(hirerId: string): Promise<Post> {
  void hirerId;
  throw new Error("TODO(phase2): shill — LLM writes, content filter, publish to X");
}
