/**
 * A stand-in for the hosted MCP server, used as the client's fetch. It records every request and
 * answers like Hyperodds does: JSON, with each tool's result as structured content.
 */

import { readFileSync } from "node:fs";

/** tools/list as the hosted server answered it; the catalog tests compare against it. */
export const hosted = JSON.parse(
  readFileSync(new URL("fixtures/tools-list.json", import.meta.url), "utf8"),
).tools;

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function market(over = {}) {
  return {
    outcome: 25457,
    title: "BTC above 80,500 at Nov 5 00:00 UTC",
    deployer: "fox",
    deployerName: "fox",
    category: "crypto",
    status: "open",
    sides: ["Yes", "No"],
    bid: 0.41,
    ask: 0.44,
    fair: 0.47,
    fairConfidence: 0.8,
    singleSource: false,
    edgePts: 2.1,
    edgeSide: 0,
    volume24h: 1520,
    settles: "2026-11-05T00:00:00.000Z",
    listed: "2026-11-04T23:00:00.000Z",
    clusterId: null,
    url: "https://usehyperodds.com/m/25457",
    ...over,
  };
}

export const fairLine = {
  outcome: 25457,
  title: "BTC above 80,500 at Nov 5 00:00 UTC",
  sides: ["Yes", "No"],
  status: "open",
  fair: {
    p: 0.47,
    lo: 0.44,
    hi: 0.5,
    method: "options",
    confidence: 0.8,
    singleSource: false,
    flags: [],
    sources: [{ name: "deribit", p: 0.47, weight: 1, ageS: 4 }],
    updated: "2026-11-04T23:40:00.000Z",
    ageS: 5,
  },
  book: { bid: 0.41, ask: 0.44, mid: 0.425 },
  edge: { refUsd: 100, buy0: 2.1, buy1: -9.4, sell0: -7.2, sell1: null },
  url: "https://usehyperodds.com/m/25457",
};

export const cluster = {
  id: "fed-dec-2026-cut",
  title: "Fed cuts rates in December",
  kind: "macro",
  anchor: 9001,
  members: [],
  merged: { bids: [], asks: [] },
  mergedWithClose: { bids: [], asks: [] },
};

const results = {
  odds_markets: () => ({ structuredContent: { total: 1, count: 1, markets: [market()] } }),
  odds_new: () => ({ structuredContent: { total: 1, count: 1, markets: [market()] } }),
  odds_fair: () => ({ structuredContent: fairLine }),
  odds_cluster: () => ({ structuredContent: cluster }),
};

/**
 * `tools` overrides a tool's result; `intercept` sees every message first and may answer it with
 * a Response (or a promise of one) instead.
 */
export function server(tools = {}, intercept = () => undefined) {
  const sent = [];
  const answer = async (body) => {
    const custom = await intercept(body);
    if (custom) return custom;
    if (body.method === "initialize")
      return json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "hyperodds", version: "1.0.0" },
        },
      });
    if (body.id === undefined) return new Response(null, { status: 202 });
    if (body.method === "tools/list") return json({ jsonrpc: "2.0", id: body.id, result: { tools: hosted } });
    const run = tools[body.params.name] ?? results[body.params.name];
    if (!run) return json({ jsonrpc: "2.0", id: body.id, error: { code: -32602, message: "Unknown tool" } });
    return json({ jsonrpc: "2.0", id: body.id, result: run(body.params.arguments) });
  };
  // Like fetch, it gives up as soon as the signal aborts, whatever the server is doing.
  const fetch = (url, init) => {
    const body = JSON.parse(init.body);
    sent.push({ url, headers: init.headers, body });
    return new Promise((resolve, reject) => {
      if (init.signal?.aborted) return reject(init.signal.reason);
      init.signal?.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      answer(body).then(resolve, reject);
    });
  };
  return {
    fetch,
    sent,
    calls: () => sent.filter((s) => s.body.method === "tools/call").map((s) => s.body.params),
  };
}
