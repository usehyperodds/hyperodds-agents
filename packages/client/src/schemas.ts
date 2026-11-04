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
const limit = z.number().int().min(1).max(100).describe("Markets to return, 1 to 100. Default 20");
const offset = z.number().int().min(0).max(10_000).describe("Markets to skip, for the next page. Default 0");
const outcome = z
  .number()
  .int()
  .min(0)
  .describe("Outcome id of a market, as odds_markets and odds_new return it");

export const marketsInput = z.object({
  category: category.optional(),
  deployer: z
    .string()
    .max(16)
    .optional()
    .describe("Deployer code, such as hl (Hyperliquid, settled by the protocol), out, txyz or skew"),
  sort: z
    .enum(["volume", "edge", "new", "settling"])
    .optional()
    .describe(
      "volume (default): most traded first. edge: the largest edge after fees, among lines with confidence of at least 0.5 that rest on more than one quote, on books with depth and a spread of at most 10 points. new: newest listings first. settling: soonest to settle first",
    ),
  q: z.string().max(100).optional().describe("Text to look for in the title, label, subcategory or deployer"),
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
