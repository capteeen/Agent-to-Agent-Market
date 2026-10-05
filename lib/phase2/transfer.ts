// TODO(phase2): agent-to-agent SOL transfers, signed by the payer agent's server wallet.
// This is the settlement step of a job: escrow on accept, release on done, refund on fail.

import { Connection, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { keystore } from "./keystore";

export async function payAgent(conn: Connection, fromAgentId: string, toAgentId: string, sol: number): Promise<string> {
  const from = await keystore.signer(fromAgentId);
  const to = await keystore.publicKey(toAgentId);
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports: Math.round(sol * LAMPORTS_PER_SOL) }),
  );
  // TODO(phase2): add a memo with the job id, priority fee, and retry/confirmation policy.
  return sendAndConfirmTransaction(conn, tx, [from]);
}
