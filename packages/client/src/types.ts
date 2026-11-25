import type { z } from "zod";
import type {
  clusterInput,
  fairInput,
  fetchInput,
  forecastRecordInput,
  leaderboardInput,
  marketsInput,
  newInput,
  searchInput,
} from "./schemas.js";

export type MarketsInput = z.input<typeof marketsInput>;
export type NewInput = z.input<typeof newInput>;
export type FairInput = z.input<typeof fairInput>;
export type ClusterInput = z.input<typeof clusterInput>;
export type SearchInput = z.input<typeof searchInput>;
export type FetchInput = z.input<typeof fetchInput>;
export type LeaderboardInput = z.input<typeof leaderboardInput>;
export type ForecastRecordInput = z.input<typeof forecastRecordInput>;

/** Prices and fair lines are probabilities of side 0, from 0 to 1. */
export interface Market {
  /** Outcome id; the side coins are `#<outcome*10>` and `#<outcome*10+1>`. */
  outcome: number;
  title: string;
  deployer: string;
  deployerName: string;
  category: string;
  /**
   * What the market asks: `price_binary`, `price_bucket` or `price_touch` (a price), `contest_winner`,
   * `contest_result`, `contest_spread` or `contest_total` (a game), `tournament_winner`,
   * `award_winner`, `policy_rate`, `ipo_confirmed`, `ipo_market_cap`, or `other`.
   */
  kind: string;
  /** `open`, `live` (the event has started) or `awaiting` (past its time, trading until it settles). */
  status: string;
  /** Side 0 and side 1 labels. */
  sides: string[];
  bid: number | null;
  ask: number | null;
  fair: number | null;
  /** How far to trust the fair line, 0 to 1. Edge rankings need at least 0.5. */
  fairConfidence: number | null;
  /** True when one quote sets the line; such lines stay out of edge rankings. */
  singleSource: boolean | null;
  /** Best buy edge in points after all fees for a $100 order; null without a line or a fill. */
  edgePts: number | null;
  edgeSide: number | null;
  /** Contracts traded in the last 24 hours; a contract pays $1 if its side wins. */
  volume24h: number;
  /** A game's start or a decision's time, not when the market settles; null for price markets. ISO 8601 UTC. */
  starts: string | null;
  /** A price market settles at its price time; null for every other market. ISO 8601 UTC. */
  settlesAt: string | null;
  /** Any other market settles by this deadline, the latest it can settle. ISO 8601 UTC. */
  settlesBy: string | null;
  /** `settlesAt`, else `settlesBy`. ISO 8601 UTC. */
  settles: string | null;
  /** ISO 8601 UTC; null for listings older than Hyperodds' records. */
  listed: string | null;
  /** For odds_cluster; null when only this deployer lists the question. */
  clusterId: string | null;
  url: string;
}

export interface MarketList {
  /** When the answer was put together. ISO 8601 UTC. */
  asOf: string;
  /** Markets that match, before limit and offset. */
  total: number;
  count: number;
  markets: Market[];
}

export interface FairSource {
  /** Where the input comes from: Deribit, Bybit, Hyperliquid, Polymarket or Kalshi. */
  venue: string;
  /** What was read there: an options surface, realized volatility, or the matched market's title. */
  label: string;
  /** `deribit`, `bybit`, `cboe`, `hl-realized-vol`, or `pm:<id>` and `kx:<ticker>` for a matched market. */
  name: string;
  p: number;
  weight: number;
  ageS: number;
}

export interface FairLine {
  /** When the answer was put together. ISO 8601 UTC. */
  asOf: string;
  outcome: number;
  title: string;
  kind: string;
  sides: string[];
  status: string;
  starts: string | null;
  settlesAt: string | null;
  settlesBy: string | null;
  fair: {
    p: number;
    lo: number;
    hi: number;
    method: "options" | "realized-vol" | "blend" | "consensus";
    confidence: number;
    singleSource: boolean;
    /** Why confidence was lowered, if it was. */
    flags: string[];
    sources: FairSource[];
    updated: string;
    ageS: number;
  } | null;
  book: { bid: number | null; ask: number | null; mid: number | null };
  /** Edge in points after all fees for each way to trade, at `refUsd`. */
  edge: {
    refUsd: number;
    buy0: number | null;
    buy1: number | null;
    sell0: number | null;
    sell1: number | null;
  } | null;
  url: string;
}

export interface RuleDiff {
  /** The rule that differs, such as `source`, `cutoff` or `void`. */
  field: string;
  /** The anchor's value. */
  a: string;
  /** This member's value. */
  b: string;
  severity: "info" | "close" | "different";
  note: string;
}

export interface ClusterMember {
  outcome: number;
  title: string;
  deployer: string;
  deployerName: string;
  /** Rule grade against the anchor. */
  grade: "SAME" | "CLOSE" | "DIFFERENT";
  /** Side 0 here is side 1 of the anchor. */
  flipped: boolean;
  diffs: RuleDiff[];
  bid: number | null;
  ask: number | null;
  fair: number | null;
  /** Contracts traded in the last 24 hours. */
  volume24h: number;
  url: string;
}

export interface BookLevel {
  /** Price of the anchor's side 0. */
  px: number;
  sz: number;
  /** The member this level belongs to. */
  outcome: number;
}

export interface Cluster {
  /** When the answer was put together. ISO 8601 UTC. */
  asOf: string;
  id: string;
  title: string;
  kind: string;
  /** The outcome whose side orientation the merged book uses. */
  anchor: number;
  members: ClusterMember[];
  /** Top five levels a side across SAME members. */
  merged: { bids: BookLevel[]; asks: BookLevel[] };
  mergedWithClose: { bids: BookLevel[]; asks: BookLevel[] };
}

export interface SearchResult {
  /** The market's outcome id, for fetch. */
  id: string;
  /** Market title and deployer. */
  title: string;
  /** The market's page on Hyperodds, to cite. */
  url: string;
}

export interface SearchResults {
  /** Up to 20 markets; empty when the question matches nothing. */
  results: SearchResult[];
}

export interface MarketPage {
  id: string;
  title: string;
  /** The market in plain text, written to be quoted; prices in it are in cents (62¢ is 0.62). */
  text: string;
  url: string;
  /** The market's fields as odds_markets gives them. */
  metadata: Market;
}

export interface BoardStats {
  /** Resolved forecasts counted. */
  n: number;
  /** Mean Brier score, 0 (perfect) to 1. */
  brier: number | null;
  nFair: number;
  /** Mean Brier of the fair line minus the forecaster's; positive beats it. */
  skillFair: number | null;
  /** `skillFair` less two standard errors, which established rows rank by. */
  skillFairLow: number | null;
  nMarket: number;
  /** Mean Brier of the market mid minus the forecaster's. */
  skillMarket: number | null;
}

export interface BoardRow extends BoardStats {
  rank: number;
  forecaster: string;
  /** Fewer than 50 resolved forecasts carrying a fair line. */
  early: boolean;
}

export interface Leaderboard {
  /** When the newest daily record closed; null before the first one. */
  asOf: string | null;
  /** The newest closed UTC day that has a record. */
  through: string | null;
  records: number;
  settled: number;
  settlementsRoot: string;
  /** The fair line and the market price, scored on the same forecasts. */
  baselines: (BoardStats & { key: "fair" | "market"; label: string })[];
  total: number;
  resolved: number;
  established: number;
  rows: BoardRow[];
}

export interface RecordedForecast {
  id: number;
  outcome: number;
  title: string;
  /** Probability that side 0 wins, in basis points: 6200 is 62.00%. */
  probabilityBps: number;
  cutoff: string;
  /** The result and score once the market settles, and what Hyperodds recorded beside the forecast. */
  [field: string]: unknown;
}

export interface ForecastRecord {
  forecaster: string;
  /** The forecaster's board row; null before a resolved forecast. */
  summary: BoardRow | null;
  /** Forecasts before their cutoff, which stay private. */
  pending: number;
  pendingMarkets: number;
  total: number;
  forecasts: RecordedForecast[];
  draft?: { draft: string; status: "open" | "signed" | "expired" };
}
