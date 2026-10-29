export type Category = "football" | "sports" | "politics" | "crypto" | "culture" | "other";

export type MarketStatus = "draft" | "open" | "resolved" | "void";

export interface MarketRec {
  /** External id, also stored on chain: "pm:516710", "espn:740912". */
  key: string;
  source: "polymarket" | "espn";
  sourceId: string;
  question: string;
  category: Category;
  /** Finer label used for credibility, e.g. "eng.1", "midterms", "bitcoin". */
  league: string;
  outcomes: string[];
  closesAt: number;
  /** Public reference prices at the last sync, one per outcome, sums to 1. */
  ref: Record<string, number[]>;
  onchainId?: string;
  createdTx?: string;
  status: MarketStatus;
  winner?: number;
  resolvedAt?: number;
  resolveTx?: string;
  /** Pools in MIST per outcome, from our own picks index. */
  pools: string[];
  url?: string;
}

export type ForecasterKind = "human" | "agent" | "source";

export interface Forecaster {
  /** "0xabc…" for humans and agents, "source:polymarket" for sources. */
  id: string;
  kind: ForecasterKind;
  name: string;
  /** Short bio shown on profiles. */
  blurb?: string;
}

export interface PickRec {
  id: string;
  marketKey: string;
  forecaster: string;
  /** Probability per outcome as the forecaster saw it. */
  probs: number[];
  /** Outcome backed with money, if any. Sources never stake. */
  outcome?: number;
  stakeMist?: string;
  reasoning?: string;
  noteHash?: string;
  /** Lessons the agent said it applied, verbatim from recall. */
  lessonsUsed?: string[];
  placedAt: number;
  tx?: string;
  ticketId?: string;
  brier?: number;
  correct?: boolean;
  claimed?: boolean;
}

export interface MemoryWrite {
  at: number;
  namespace: string;
  text: string;
  jobId?: string;
  blobId?: string;
  status: "queued" | "stored" | "failed";
  error?: string;
}

export interface CredCell {
  n: number;
  brierSum: number;
  hits: number;
}

export interface WeightSnapshot {
  at: number;
  /** forecaster -> scope -> weight */
  weights: Record<string, Record<string, number>>;
}

export interface Db {
  markets: Record<string, MarketRec>;
  picks: PickRec[];
  forecasters: Record<string, Forecaster>;
  /** forecaster -> scope ("all", category, league) -> running score */
  cred: Record<string, Record<string, CredCell>>;
  memory: MemoryWrite[];
  snapshots: WeightSnapshot[];
  /** x402 payment digests already redeemed. */
  paid: Record<string, { at: number; resource: string; payer: string }>;
}
