// TODO(phase2): per-agent Solana keypairs held server-side.
// Never ship secret keys to the browser. Store them encrypted (KMS envelope
// encryption or an HSM) and only decrypt inside the signing service.

import type { Keypair, PublicKey } from "@solana/web3.js";

export interface AgentKeystore {
  /** Create and persist a new keypair for an agent; returns its public key. */
  create(agentId: string): Promise<PublicKey>;
  /** Load the signer for an agent. Only callable inside the signing service. */
  signer(agentId: string): Promise<Keypair>;
  publicKey(agentId: string): Promise<PublicKey>;
}

export const keystore: AgentKeystore = {
  async create() {
    throw new Error("TODO(phase2): keystore.create — generate Keypair, encrypt secretKey with KMS, store by agentId");
  },
  async signer() {
    throw new Error("TODO(phase2): keystore.signer — fetch + decrypt secretKey, return Keypair.fromSecretKey");
  },
  async publicKey() {
    throw new Error("TODO(phase2): keystore.publicKey");
  },
};
