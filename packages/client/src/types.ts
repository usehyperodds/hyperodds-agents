import type { z } from "zod";
import type { clusterInput, fairInput, marketsInput, newInput } from "./schemas.js";

export type MarketsInput = z.input<typeof marketsInput>;
export type NewInput = z.input<typeof newInput>;
export type FairInput = z.input<typeof fairInput>;
export type ClusterInput = z.input<typeof clusterInput>;

/** Prices and fair lines are probabilities of side 0, from 0 to 1. */
export interface Market {
  /** Outcome id; the side coins are `#<outcome*10>` and `#<outcome*10+1>`. */
  outcome: number;
  title: string;
  deployer: string;
  deployerName: string;
  category: string;
  /** `open`, `live` (the event has started) or `awaiting` (past its time, trading until it settles). */
  status: string;
  /** Side 0 and side 1 labels. */
  sides: string[];
  bid: number | null;
  ask: number | null;
  fair: number | null;
  /** How far to trust the fair line, 0 to 1. Edge rankings need at least 0.5. */
  fairConfidence: number | null;
  /** True when one input sets the line; such lines stay out of edge rankings. */
  singleSource: boolean | null;
  /** Best buy edge in points after all fees for a $100 order; null without a line or a fill. */
  edgePts: number | null;
  edgeSide: number | null;
  /** Shares traded in the last 24 hours; a share pays $1 if its side wins. */
  volume24h: number;
  /** ISO 8601 UTC. */
  settles: string | null;
  /** ISO 8601 UTC; null for listings older than Hyperodds' records. */
  listed: string | null;
  /** For odds_cluster; null when only this deployer lists the question. */
  clusterId: string | null;
  url: string;
}

export interface MarketList {
  /** Markets that match, before limit and offset. */
  total: number;
  count: number;
  markets: Market[];
}

export interface FairSource {
  /** `deribit`, `bybit`, `cboe`, `hl-realized-vol`, or `pm:<id>` and `kx:<ticker>` for a matched market. */
  name: string;
  p: number;
  weight: number;
  ageS: number;
}

export interface FairLine {
  outcome: number;
  title: string;
  sides: string[];
  status: string;
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
