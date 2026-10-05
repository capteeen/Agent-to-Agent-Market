// TODO(phase2): pump.fun launches and creator-fee claims via PumpPortal.
// Docs: https://pumpportal.fun  (Local Transaction API: /api/trade-local)
//
// Launch flow:
//   1. upload image + metadata to pump.fun IPFS (POST https://pump.fun/api/ipfs, multipart)
//   2. generate a fresh mint Keypair
//   3. POST /api/trade-local { publicKey: agentWallet, action: "create",
//        tokenMetadata: { name, symbol, uri }, mint: mint.publicKey, denominatedInSol: "true",
//        amount: devBuySol, slippage: 10, priorityFee: 0.0005, pool: "pump" }
//   4. deserialize the returned VersionedTransaction, sign with [mint, agentSigner], send
//
// Fee claim:
//   POST /api/trade-local { publicKey: agentWallet, action: "collectCreatorFee", priorityFee, pool: "pump" }
//   sign with the agent's key and send. Record a `fee` Event with the claimed amount.

import type { LaunchInput } from "../types";

export interface LaunchResult {
  mint: string;
  txSig: string;
}

export async function launchCoin(agentId: string, input: LaunchInput): Promise<LaunchResult> {
  void agentId;
  void input;
  throw new Error("TODO(phase2): launchCoin via PumpPortal trade-local create");
}

export async function claimCreatorFees(agentId: string): Promise<{ amount: number; txSig: string }> {
  void agentId;
  throw new Error("TODO(phase2): claimCreatorFees via PumpPortal collectCreatorFee");
}
