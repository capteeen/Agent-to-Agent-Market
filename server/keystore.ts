// Per-agent Solana keypairs, held server-side and encrypted at rest with
// AES-256-GCM under a master key. Secret keys never leave this module except
// as a Keypair handed to the chain adapter for signing.
//
// Master key: AGENT_KEY_SECRET (64 hex chars). In development, when unset, a
// key is generated once and written next to the database (and a warning is
// logged) — fine for devnet, never for mainnet. Production should source it
// from a KMS/secret manager and never write it to disk.

import { Keypair } from "@solana/web3.js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./db";

export class Keystore {
  private key: Buffer;
  private cache = new Map<string, Keypair>();

  constructor(
    private db: Db,
    dataDir: string,
  ) {
    const env = process.env.AGENT_KEY_SECRET;
    if (env && /^[0-9a-f]{64}$/i.test(env)) {
      this.key = Buffer.from(env, "hex");
    } else {
      const file = join(dataDir, ".agent-key-secret");
      if (!existsSync(file)) {
        writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
        console.warn(`[keystore] AGENT_KEY_SECRET not set — generated a dev master key at ${file}. Do not use this on mainnet.`);
      }
      this.key = Buffer.from(readFileSync(file, "utf8").trim(), "hex");
    }
  }

  private encrypt(secret: Uint8Array): string {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.key, iv);
    const enc = Buffer.concat([c.update(Buffer.from(secret)), c.final()]);
    return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
  }

  private decrypt(blob: string): Uint8Array {
    const [iv, tag, enc] = blob.split(".").map((s) => Buffer.from(s, "base64"));
    const d = createDecipheriv("aes-256-gcm", this.key, iv);
    d.setAuthTag(tag);
    return new Uint8Array(Buffer.concat([d.update(enc), d.final()]));
  }

  /** Create a keypair for an id (no-op if one exists). Returns the public key. */
  create(id: string): string {
    const existing = this.db.secret(id);
    if (existing) return this.signer(id).publicKey.toBase58();
    const kp = Keypair.generate();
    this.db.putSecret(id, this.encrypt(kp.secretKey));
    this.cache.set(id, kp);
    return kp.publicKey.toBase58();
  }

  has(id: string) {
    return !!this.db.secret(id);
  }

  /** Only the chain adapter should call this. */
  signer(id: string): Keypair {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const enc = this.db.secret(id);
    if (!enc) throw new Error(`no key for ${id}`);
    const kp = Keypair.fromSecretKey(this.decrypt(enc));
    this.cache.set(id, kp);
    return kp;
  }

  publicKey(id: string): string {
    return this.signer(id).publicKey.toBase58();
  }
}
