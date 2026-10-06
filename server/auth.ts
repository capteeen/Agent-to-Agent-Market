// Owner authentication: the wallet signs a one-time message we issued.
// No sessions, no cookies — every owner action carries its own proof.
//
//   1. POST /api/auth/nonce { wallet }            → { nonce, message }
//   2. wallet.signMessage(message)                 (Phantom/Solflare/Backpack)
//   3. POST /api/agents/:id/claim { wallet, nonce, signature, ...params }
//
// The message embeds the action and params, so a signature can't be replayed
// for a different action, and the nonce can't be used twice.

import nacl from "tweetnacl";
import bs58 from "bs58";
import { randomBytes } from "node:crypto";
import type { Db } from "./db";

const NONCE_TTL = 5 * 60_000;

export interface Signed {
  wallet: string;
  nonce: string;
  /** base58 or base64 detached ed25519 signature over `message` */
  signature: string;
  action: string;
  params?: Record<string, unknown>;
}

export function buildMessage(action: string, wallet: string, nonce: string, params: Record<string, unknown> = {}) {
  const lines = [`AGENTMARKET ${action}`, `wallet: ${wallet}`, `nonce: ${nonce}`];
  for (const k of Object.keys(params).sort()) lines.push(`${k}: ${String(params[k])}`);
  return lines.join("\n");
}

export function issueNonce(db: Db, wallet: string, action: string, params?: Record<string, unknown>) {
  const nonce = randomBytes(16).toString("hex");
  db.issueNonce(wallet, nonce, NONCE_TTL);
  return { nonce, message: buildMessage(action, wallet, nonce, params) };
}

function decodeSig(s: string): Uint8Array {
  try {
    const b = bs58.decode(s);
    if (b.length === 64) return b;
  } catch {}
  const b = Buffer.from(s, "base64");
  if (b.length === 64) return new Uint8Array(b);
  throw new Error("bad signature encoding");
}

/** Throws if the signature is not a valid, fresh proof from `wallet` for this action. */
export function verify(db: Db, s: Signed) {
  if (!s.wallet || !s.nonce || !s.signature) throw new Error("missing auth fields");
  const msg = buildMessage(s.action, s.wallet, s.nonce, s.params ?? {});
  const ok = nacl.sign.detached.verify(new TextEncoder().encode(msg), decodeSig(s.signature), bs58.decode(s.wallet));
  if (!ok) throw new Error("bad signature");
  if (!db.useNonce(s.wallet, s.nonce)) throw new Error("nonce expired or already used");
}

/** Test helper / CLI: sign a message with a raw secret key. */
export function signWith(secretKey: Uint8Array, message: string): string {
  return bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), secretKey));
}
