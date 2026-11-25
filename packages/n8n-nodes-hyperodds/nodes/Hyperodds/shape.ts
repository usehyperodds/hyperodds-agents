import type { IDataObject } from "n8n-workflow";

export const CONSOLE_URL = "https://usehyperodds.com";

/** The role of the "Other" outcome a multi-outcome question lists for when no named one wins. */
export const FALLBACK = "fallback";

interface FairLine {
  p: number;
  lo: number;
  hi: number;
  method: string;
  singleSource: boolean;
  confidence: number;
  flags?: string[];
  sources?: { name: string; p: number; weight: number; ageMs: number }[];
  ts: number;
}

interface Edge {
  refUsd: number;
  buy0: number | null;
  buy1: number | null;
  sell0: number | null;
  sell1: number | null;
  best: { side: number; action: string; pts: number } | null;
}

/** A market summary as `markets.list`, `markets.newest` and `markets.edges` send it. */
export interface Summary {
  outcome: number;
  title: string;
  deployer: string;
  deployerName: string;
  category: string;
  status: string;
  sideLabels: string[];
  bid: number | null;
  ask: number | null;
  mid: number | null;
  fair: FairLine | null;
  edge: Edge | null;
  volume24h: number;
  eventTime: number | null;
  deadline: number | null;
  listedAt: number | null;
  clusterId: string | null;
  role?: string;
  [field: string]: unknown;
}

interface RuleDiff {
  field: string;
  a: string;
  b: string;
  severity: string;
  note: string;
}

interface Level {
  px: number;
  sz: number;
  source?: string;
}

export interface ClusterView {
  id: string;
  title: string;
  kind: string;
  anchor: number;
  members: { summary: Summary; grade: string; flipped: boolean; diffs: RuleDiff[] }[];
  mergedBook: { bids: Level[]; asks: Level[] } | null;
  mergedBookWithClose: { bids: Level[]; asks: Level[] } | null;
}

export interface MarketDetail {
  summary: Summary;
  fair: FairLine | null;
  cluster: ClusterView | null;
  [field: string]: unknown;
}

export const marketUrl = (outcome: number) => `${CONSOLE_URL}/m/${outcome}`;

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
const r = (n: number, digits: number) => Number(n.toFixed(digits));
const rn = (n: number | null | undefined, digits: number) =>
  n === null || n === undefined ? null : r(n, digits);

/**
 * The fields, names and precision the hosted MCP tools give, so one reference
 * (usehyperodds.com/docs/mcp) describes both and an agent sees the same numbers either way.
 */
export function fullMarket(m: Summary): IDataObject {
  return {
    outcome: m.outcome,
    title: m.title,
    deployer: m.deployer,
    deployerName: m.deployerName,
    category: m.category,
    status: m.status,
    sides: m.sideLabels,
    bid: rn(m.bid, 5),
    ask: rn(m.ask, 5),
    fair: rn(m.fair?.p, 4),
    fairConfidence: rn(m.fair?.confidence, 2),
    singleSource: m.fair ? m.fair.singleSource : null,
    edgePts: rn(m.edge?.best?.pts, 2),
    edgeSide: m.edge?.best?.side ?? null,
    volume24h: r(m.volume24h, 2),
    settles: iso(m.eventTime ?? m.deadline),
    listed: iso(m.listedAt),
    clusterId: m.clusterId,
    url: marketUrl(m.outcome),
  };
}

/** What Output: Simplified returns. n8n's UX guidelines keep a simplified item to ten fields. */
export const SIMPLIFIED = [
  "outcome",
  "title",
  "bid",
  "ask",
  "fair",
  "fairConfidence",
  "singleSource",
  "edgePts",
  "edgeSide",
  "url",
];

export const pick = (from: IDataObject, keys: string[]): IDataObject =>
  Object.fromEntries(keys.filter((k) => k in from).map((k) => [k, from[k]]));

export function rawMarket(m: Summary): IDataObject {
  return { ...m, url: marketUrl(m.outcome) };
}

export function simplifyFairLine(detail: MarketDetail, now = Date.now()): IDataObject {
  const { summary: m, fair: f } = detail;
  return {
    outcome: m.outcome,
    title: m.title,
    sides: m.sideLabels,
    status: m.status,
    fair: f && {
      p: r(f.p, 4),
      lo: r(f.lo, 4),
      hi: r(f.hi, 4),
      method: f.method,
      confidence: r(f.confidence, 2),
      singleSource: f.singleSource,
      flags: f.flags ?? [],
      sources: (f.sources ?? []).map((x) => ({
        name: x.name,
        p: r(x.p, 4),
        weight: r(x.weight, 3),
        ageS: Math.round(x.ageMs / 1000),
      })),
      updated: new Date(f.ts).toISOString(),
      ageS: Math.max(0, Math.round((now - f.ts) / 1000)),
    },
    book: { bid: rn(m.bid, 5), ask: rn(m.ask, 5), mid: rn(m.mid, 6) },
    edge: m.edge && {
      refUsd: m.edge.refUsd,
      buy0: rn(m.edge.buy0, 2),
      buy1: rn(m.edge.buy1, 2),
      sell0: rn(m.edge.sell0, 2),
      sell1: rn(m.edge.sell1, 2),
    },
    url: marketUrl(m.outcome),
  };
}

export function simplifyCluster(c: ClusterView): IDataObject {
  return {
    id: c.id,
    title: c.title,
    kind: c.kind,
    anchor: c.anchor,
    members: c.members.map(({ summary: m, grade, flipped, diffs }) => ({
      outcome: m.outcome,
      title: m.title,
      deployer: m.deployer,
      deployerName: m.deployerName,
      grade,
      flipped,
      diffs: diffs.map(({ field, a, b, severity, note }) => ({ field, a, b, severity, note })),
      bid: rn(m.bid, 5),
      ask: rn(m.ask, 5),
      fair: rn(m.fair?.p, 4),
      volume24h: r(m.volume24h, 2),
      url: marketUrl(m.outcome),
    })),
    merged: topOfBook(c.mergedBook),
    mergedWithClose: topOfBook(c.mergedBookWithClose),
  };
}

/** A level's source names its member as `<venue>:<outcome>`, such as `hl:8573`. */
const sourceOutcome = (source?: string) => {
  const outcome = Number(source?.slice(source.lastIndexOf(":") + 1));
  return source && Number.isInteger(outcome) ? outcome : null;
};

function topOfBook(book: ClusterView["mergedBook"]) {
  const levels = (side: Level[] = []) =>
    side.slice(0, 5).map(({ px, sz, source }) => ({
      px: r(px, 5),
      sz: r(sz, 2),
      outcome: sourceOutcome(source),
    }));
  return { bids: levels(book?.bids), asks: levels(book?.asks) };
}

/**
 * Strips control, format (zero-width, bidi override), private-use, surrogate and other invisible
 * characters, such as Hangul fillers, from every string, and turns line and paragraph separators
 * into spaces. Deployers write the titles and rules, and an AI agent may read this output.
 */
export function clean<T>(value: T): T {
  if (typeof value === "string")
    return value.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").replace(/[\p{Cf}\p{Co}\p{Cs}\p{DI}]/gu, "") as T;
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)])) as T;
  return value;
}
