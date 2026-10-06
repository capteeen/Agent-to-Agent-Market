"use client";

import { create } from "zustand";
import type { Agent, AgentHistory, Job, LaunchInput, MarketEvent, MarketReport, MarketStats, Policy } from "./types";
import type { RepStats } from "./reputation";

/**
 * Client view of the market. Whatever MarketSource is active (the Phase 1
 * simulator, or the Phase 2 remote backend) pushes snapshots in via
 * `ingest`. UI components only ever read from here.
 */
export interface MarketState {
  ready: boolean;
  agents: Record<string, Agent>;
  order: string[];
  jobs: Job[];
  events: MarketEvent[];
  stats: MarketStats;
  history: Record<string, AgentHistory>;
  reports: MarketReport[];
  rep: Record<string, RepStats>;
  /** epoch ms the hourly bell last rang (0 = never this session) */
  bellAt: number;
  /** the source's clock (ms). Everything on screen is "as of" this. */
  simTime: number;
  /** 0..1 while the season is being replayed on load */
  progress: number;
  ingest: (patch: Partial<Omit<MarketState, "ingest" | "launchAgent" | "claimFees" | "fundAgent" | "setPolicy">>) => void;
  launchAgent: (input: LaunchInput) => Promise<Agent>;
  claimFees: (agentId: string) => Promise<number>;
  fundAgent: (agentId: string, sol: number) => Promise<void>;
  setPolicy: (agentId: string, policy: Policy) => Promise<void>;
}

export const useMarket = create<MarketState>()((set) => ({
  ready: false,
  agents: {},
  order: [],
  jobs: [],
  events: [],
  stats: { agentsAlive: 0, jobsCompleted: 0, solMoved: 0, feesEarned: 0 },
  history: {},
  reports: [],
  rep: {},
  bellAt: 0,
  simTime: 0,
  progress: 0,
  ingest: (patch) => set(patch),
  // replaced by the active source on boot
  launchAgent: async () => {
    throw new Error("market not ready");
  },
  claimFees: async () => 0,
  fundAgent: async () => {},
  setPolicy: async () => {},
}));

interface UiState {
  sound: boolean;
  night: boolean;
  /** camera follows the latest hire */
  follow: boolean;
  setSound: (v: boolean) => void;
  setNight: (v: boolean) => void;
  setFollow: (v: boolean) => void;
}

export const useUi = create<UiState>()((set) => ({
  sound: false,
  night: true,
  follow: true,
  setFollow: (follow) => set({ follow }),
  setSound: (sound) => {
    set({ sound });
    try {
      localStorage.setItem("am.sound", sound ? "1" : "0");
    } catch {}
  },
  setNight: (night) => {
    set({ night });
    try {
      localStorage.setItem("am.night", night ? "1" : "0");
    } catch {}
  },
}));
