// The settlement layer. Two implementations behind one interface:
//   PaperChain  — an internal ledger; every "transfer" is a bookkeeping entry
//                 with a fake signature. The whole engine runs end-to-end.
//   SolanaChain — real SystemProgram transfers signed by the agent's server
//                 key on the configured cluster (devnet by default).
// The engine never signs anything itself; it only calls this.

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createHash } from "node:crypto";
import type { Db } from "./db";
import type { Keystore } from "./keystore";

export interface TransferInfo {
  from: string;
  to: string;
  sol: number;
}

export interface Chain {
  readonly mode: "paper" | "live";
  readonly cluster: string;
  /** SOL balance of a public key */
  balance(pubkey: string): Promise<number>;
  /** Move SOL from an agent's wallet (signed server-side). Returns the signature. */
  transfer(fromId: string, toPubkey: string, sol: number, memo?: string): Promise<string>;
  /** Look up a transfer by signature (used to verify owner top-ups). */
  lookup(sig: string): Promise<TransferInfo | null>;
  /** Paper mode only: credit a wallet out of thin air (owner funding without a real tx). */
  mint(pubkey: string, sol: number): Promise<void>;
}

const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export class PaperChain implements Chain {
  readonly mode = "paper" as const;
  readonly cluster = "paper";
  private seq = 0;

  constructor(
    private db: Db,
    private keys: Keystore,
  ) {}

  private key(pub: string) {
    return `paper:bal:${pub}`;
  }

  async balance(pub: string) {
    return Number(this.db.get(this.key(pub)) ?? 0);
  }

  private setBal(pub: string, v: number) {
    this.db.set(this.key(pub), String(Math.max(0, Math.round(v * 1e9) / 1e9)));
  }

  async transfer(fromId: string, to: string, sol: number, memo = "") {
    const from = this.keys.publicKey(fromId);
    // read and write inside one transaction: transfers from the same wallet
    // (escrow paying two jobs) interleave across awaits, so no stale reads
    this.db.transaction(() => {
      const bal = Number(this.db.get(this.key(from)) ?? 0);
      if (bal < sol) throw new Error(`insufficient funds: ${from} has ${bal}, needs ${sol}`);
      this.setBal(from, bal - sol);
      this.db.set(this.key(to), String(Number(this.db.get(this.key(to)) ?? 0) + sol));
    });
    const sig = "paper" + createHash("sha256").update(`${from}${to}${sol}${memo}${this.seq++}${Date.now()}`).digest("hex").slice(0, 80);
    this.db.logTx(sig, { from, to, sol, memo, paper: true });
    return sig;
  }

  async lookup(sig: string): Promise<TransferInfo | null> {
    const info = this.db.tx<TransferInfo>(sig);
    return info ? { from: info.from, to: info.to, sol: info.sol } : null;
  }

  async mint(pub: string, sol: number) {
    this.setBal(pub, (await this.balance(pub)) + sol);
  }
}

export class SolanaChain implements Chain {
  readonly mode = "live" as const;
  readonly cluster: string;
  private conn: Connection;

  constructor(
    private keys: Keystore,
    rpc: string,
    cluster: string,
  ) {
    this.cluster = cluster;
    this.conn = new Connection(rpc, "confirmed");
  }

  get connection() {
    return this.conn;
  }

  async balance(pub: string) {
    return (await this.conn.getBalance(new PublicKey(pub))) / LAMPORTS_PER_SOL;
  }

  async transfer(fromId: string, to: string, sol: number, memo = "") {
    const from: Keypair = this.keys.signer(fromId);
    const lamports = Math.round(sol * LAMPORTS_PER_SOL);
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: new PublicKey(to), lamports }));
    if (memo) tx.add(new TransactionInstruction({ keys: [], programId: MEMO_PROGRAM, data: Buffer.from(memo.slice(0, 120), "utf8") }));
    return sendAndConfirmTransaction(this.conn, tx, [from], { commitment: "confirmed" });
  }

  async lookup(sig: string): Promise<TransferInfo | null> {
    const tx = await this.conn.getParsedTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!tx || tx.meta?.err) return null;
    for (const ix of tx.transaction.message.instructions) {
      if ("parsed" in ix && ix.program === "system" && ix.parsed?.type === "transfer") {
        const info = ix.parsed.info as { source: string; destination: string; lamports: number };
        return { from: info.source, to: info.destination, sol: info.lamports / LAMPORTS_PER_SOL };
      }
    }
    return null;
  }

  async mint() {
    throw new Error("mint is paper-mode only; fund wallets with a real transfer");
  }

  async airdrop(pub: string, sol: number) {
    const sig = await this.conn.requestAirdrop(new PublicKey(pub), Math.round(sol * LAMPORTS_PER_SOL));
    await this.conn.confirmTransaction(sig, "confirmed");
    return sig;
  }
}
