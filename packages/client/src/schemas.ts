import { z } from "zod";

export const categories = [
  "sports",
  "crypto",
  "equities",
  "commodities",
  "indices",
  "macro",
  "ipo",
  "awards",
  "other",
] as const;

const category = z.enum(categories).describe("Only markets in this category");
const limit = z.number().int().min(1).max(100).describe("Rows to return, 1 to 100. Default 20");
const offset = z.number().int().min(0).max(10_000).describe("Markets to skip, for the next page. Default 0");
const outcome = z
  .number()
  .int()
  .min(0)
  .describe("Outcome id of a market, as odds_markets, odds_new and search give it");

export const marketsInput = z.object({
  category: category.optional(),
  deployer: z
    .string()
    .max(16)
    .optional()
    .describe("Deployer code, such as hl (Hyperliquid, settled by the protocol), out, txyz, skew or fox"),
  sort: z
    .enum(["edge", "volume", "new", "settling"])
    .optional()
    .describe(
      "volume (default): most traded first. edge: lines with confidence of at least 0.5 that rest on more than one quote, on books with depth and a spread of at most 10 points, largest edge first; then every other market, most traded first. new: newest listings first. settling: markets still ahead, soonest first by each market's next moment (a game's start or a decision's time while it is ahead, otherwise when the market settles); then markets past their time and awaiting settlement",
    ),
  q: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Words to look for in the title, label, subcategory, deployer or asset names. Case, accents and thousands separators are ignored; 80k reads as 80000",
    ),
  minEdgePts: z
    .number()
    .min(0.5)
    .max(100)
    .optional()
    .describe(
      "Only markets whose best buy edge after every fee at $100 is at least this many points, on a line the edge ranking trusts (confidence of at least 0.5, more than one quote, a book with depth and a spread of at most 10 points). At least 0.5",
    ),
  limit: limit.optional(),
  offset: offset.optional(),
});

export const newInput = z.object({
  category: category.optional(),
  limit: limit.optional(),
  offset: offset.optional(),
});

export const fairInput = z.object({ outcome });

export const clusterInput = z.object({
  id: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("Cluster id, as the clusterId field of odds_markets gives it"),
  outcome: outcome.optional().describe("Outcome id of any market in the cluster; give this or id"),
});

export const searchInput = z.object({
  query: z
    .string()
    .min(1)
    .max(500)
    .describe('Words from the question, such as "bitcoin 90,000", "Fed December" or "Lakers"'),
});

export const fetchInput = z.object({
  id: z
    .string()
    .min(1)
    .max(200)
    .describe('A market id from search, such as "24848", or its usehyperodds.com/m/<id> link'),
});

const boardOffset = z
  .number()
  .int()
  .min(0)
  .max(100_000)
  .describe("Rows to skip, for the next page. Default 0");

export const leaderboardInput = z.object({
  limit: limit.optional(),
  offset: boardOffset.optional(),
});

export const forecastRecordInput = z.object({
  address: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .describe("The forecaster's address: 0x and 40 hex characters"),
  limit: limit.optional(),
  offset: boardOffset.optional(),
  draft: z
    .string()
    .max(64)
    .optional()
    .describe("A draft id from odds_forecast, to learn whether its sign link was signed"),
});
