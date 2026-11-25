const assert = require("node:assert/strict");
const { describe, test } = require("node:test");
const { NodeApiError, NodeOperationError } = require("n8n-workflow");
const { Hyperodds } = require("../dist/nodes/Hyperodds/Hyperodds.node.js");
const { simplifyCluster, simplifyFairLine } = require("../dist/nodes/Hyperodds/shape.js");
const { version } = require("../package.json");

const fixture = (name) => require(`./fixtures/${name}.json`);
const ok = (data) => ({ statusCode: 200, headers: {}, body: { result: { data } } });
const fail = (statusCode, message, headers = {}) => ({
  statusCode,
  headers,
  body: { error: { message, code: -32000, data: { httpStatus: statusCode } } },
});

/**
 * Runs the node over `items` input items with `params` (an object, or a function of the item index),
 * answering each HTTP request from `answers` in turn. Returns the output and the requests made.
 */
async function run(params, answers, { items = 1, continueOnFail = false, timezone = "UTC" } = {}) {
  const requests = [];
  const queue = [...answers];
  const ctx = {
    getInputData: () => Array.from({ length: items }, () => ({ json: {} })),
    getTimezone: () => timezone,
    getNodeParameter: (name, i, fallback) => {
      const p = typeof params === "function" ? params(i) : params;
      if (name in p) return p[name];
      if (fallback !== undefined) return fallback;
      throw new Error(`no parameter ${name}`);
    },
    getNode: () => ({
      name: "Hyperodds",
      type: "n8n-nodes-hyperodds.hyperodds",
      typeVersion: 1,
      parameters: {},
    }),
    continueOnFail: () => continueOnFail,
    helpers: {
      httpRequest: async (options) => {
        requests.push(options);
        const next = queue.shift();
        if (next instanceof Error) throw next;
        assert.ok(next, `unexpected request to ${options.url}`);
        return next;
      },
    },
  };
  const [output] = await new Hyperodds().execute.call(ctx);
  return { output, requests, input: (r) => JSON.parse(r.qs.input) };
}

const edges = fixture("edges").result.data;

describe("Hyperodds node", () => {
  test("Get Top Edges reads markets.edges and returns one item per market with ten fields", async () => {
    const { output, requests, input } = await run(
      { resource: "market", operation: "getEdges", limit: 3, minConfidence: 0.5, output: "simplified" },
      [ok(edges)],
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "GET");
    assert.equal(requests[0].url, "https://api.usehyperodds.com/trpc/markets.edges");
    assert.deepEqual(input(requests[0]), { limit: 3, minConfidence: 0.5 });
    assert.equal(requests[0].headers["user-agent"].split(" ")[0], `n8n-nodes-hyperodds/${version}`);
    assert.deepEqual(Object.keys(output[0].json), [
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
    ]);
    assert.deepEqual(
      output.map((o) => o.pairedItem),
      edges.map(() => ({ item: 0 })),
    );
    assert.equal(output[0].json.url, "https://usehyperodds.com/m/23762");
  });

  test("every field and value matches what the MCP tools give for the same markets", async () => {
    const mcp = fixture("edges.mcp").markets;
    const all = Object.keys(mcp[0]);
    const { output } = await run(
      {
        resource: "market",
        operation: "getEdges",
        limit: 3,
        minConfidence: 0.5,
        output: "fields",
        fields: all,
      },
      [ok(edges)],
    );
    // The MCP tool answered for the same markets in the same second.
    assert.deepEqual(
      output.map((o) => o.json),
      mcp,
    );
    const simplified = await run(
      { resource: "market", operation: "getEdges", limit: 3, minConfidence: 0.5, output: "simplified" },
      [ok(edges)],
    );
    for (const [i, { json }] of simplified.output.entries()) {
      for (const [key, value] of Object.entries(json)) assert.deepEqual(value, mcp[i][key], key);
    }
  });

  test("Selected Fields returns the chosen fields and always the outcome ID", async () => {
    const { output } = await run(
      {
        resource: "market",
        operation: "getEdges",
        limit: 3,
        minConfidence: 0.5,
        output: "fields",
        fields: ["volume24h", "title"],
      },
      [ok(edges)],
    );
    assert.deepEqual(output[0].json, {
      outcome: 23762,
      volume24h: edges[0].volume24h,
      title: edges[0].title,
    });
  });

  test("Output Raw returns the server's market summary with its console URL", async () => {
    const { output } = await run({ resource: "market", operation: "getNewest", limit: 2, output: "raw" }, [
      ok(edges.slice(0, 2)),
    ]);
    assert.deepEqual(output[0].json, { ...edges[0], url: "https://usehyperodds.com/m/23762" });
  });

  test("Get Many passes the filters under the server's names and leaves out what is unset", async () => {
    const { requests, input } = await run(
      {
        resource: "market",
        operation: "getAll",
        returnAll: false,
        limit: 25,
        includeOther: true,
        sort: "settling",
        filters: {
          category: "crypto",
          deployer: " out ",
          q: "  bitcoin ",
          minEdgePts: 0,
          minVolume: 1000,
          includeSettled: false,
          settlesBefore: "2026-11-06T00:00:00.000Z",
        },
        simplify: true,
      },
      [ok([])],
    );
    assert.equal(requests[0].url, "https://api.usehyperodds.com/trpc/markets.list");
    assert.deepEqual(input(requests[0]), {
      sort: "settling",
      limit: 25,
      category: "crypto",
      deployer: "out",
      q: "bitcoin",
      minEdgePts: 0,
      minVolume: 1000,
      settlesBefore: Date.parse("2026-11-06T00:00:00.000Z"),
    });

    const all = await run(
      {
        resource: "market",
        operation: "getAll",
        returnAll: true,
        sort: "volume",
        filters: {},
        simplify: true,
      },
      [ok(edges)],
    );
    assert.deepEqual(all.input(all.requests[0]), { sort: "volume" });
    assert.equal(all.output.length, edges.length);
  });

  test("leaves out the fallback 'Other' outcomes, as the MCP tools do, unless asked for them", async () => {
    const other = (m, n) => ({
      ...m,
      outcome: 90000 + n,
      title: `${m.title}: Other`,
      role: "fallback",
      bid: null,
      ask: null,
    });
    const mixed = [other(edges[0], 1), ...edges, other(edges[1], 2)];
    const many = await run(
      {
        resource: "market",
        operation: "getAll",
        returnAll: false,
        limit: 2,
        sort: "volume",
        filters: {},
        output: "simplified",
      },
      [ok(mixed)],
    );
    assert.deepEqual(many.input(many.requests[0]), { sort: "volume" });
    assert.deepEqual(
      many.output.map((o) => o.json.outcome),
      edges.slice(0, 2).map((m) => m.outcome),
    );
    const newest = await run(
      { resource: "market", operation: "getNewest", limit: 50, output: "simplified" },
      [ok(mixed)],
    );
    assert.deepEqual(newest.input(newest.requests[0]), { limit: 200 });
    assert.equal(newest.output.length, edges.length);
    const withOther = await run(
      { resource: "market", operation: "getNewest", limit: 50, includeOther: true, output: "simplified" },
      [ok(mixed)],
    );
    assert.deepEqual(withOther.input(withOther.requests[0]), { limit: 50 });
    assert.equal(withOther.output.length, mixed.length);
  });

  test("Get Fair Line gives the line, its sources, the book and the edges, as odds_fair does", async () => {
    const market = fixture("market").result.data;
    const { output, requests, input } = await run(
      { resource: "market", operation: "getFairLine", outcome: 22091, simplify: true },
      [ok(market)],
    );
    assert.equal(requests[0].url, "https://api.usehyperodds.com/trpc/markets.get");
    assert.deepEqual(input(requests[0]), { outcome: 22091 });
    const mcp = fixture("fair.mcp");
    const { ageS, ...line } = output[0].json.fair;
    const { ageS: _, ...expected } = mcp.fair;
    assert.ok(ageS >= 0);
    assert.deepEqual({ ...output[0].json, fair: line }, { ...mcp, fair: expected });
    assert.deepEqual(simplifyFairLine(market, market.fair.ts + mcp.fair.ageS * 1000), mcp);
  });

  test("Get cluster by outcome reads the market, and by ID reads the cluster, both shaped as odds_cluster", async () => {
    const cluster = fixture("cluster").result.data;
    const byOutcome = await run(
      { resource: "cluster", operation: "get", lookUpBy: "outcome", outcome: 8573, simplify: true },
      [ok({ ...fixture("market").result.data, cluster })],
    );
    assert.equal(byOutcome.requests[0].url, "https://api.usehyperodds.com/trpc/markets.get");
    assert.deepEqual(byOutcome.output[0].json, fixture("cluster.mcp"));

    const byId = await run(
      {
        resource: "cluster",
        operation: "get",
        lookUpBy: "id",
        clusterId: ` ${cluster.id} `,
        simplify: false,
      },
      [ok(cluster)],
    );
    assert.equal(byId.requests[0].url, "https://api.usehyperodds.com/trpc/clusters.get");
    assert.deepEqual(byId.input(byId.requests[0]), { id: cluster.id });
    assert.deepEqual(byId.output[0].json, cluster);
  });

  test("a market no other deployer lists has no cluster, and the error says so", async () => {
    await assert.rejects(
      run({ resource: "cluster", operation: "get", lookUpBy: "outcome", outcome: 22091, simplify: true }, [
        ok(fixture("market").result.data),
      ]),
      (error) =>
        error instanceof NodeOperationError &&
        error.message === "Outcome 22091 is listed by one deployer only, so it has no cluster.",
    );
  });

  test("reads a Settles Before picked without a zone in the workflow's time zone", async () => {
    const { requests, input } = await run(
      {
        resource: "market",
        operation: "getAll",
        returnAll: true,
        sort: "settling",
        filters: { settlesBefore: "2026-11-06T00:00:00" },
        output: "simplified",
      },
      [ok([])],
      { timezone: "America/New_York" },
    );
    assert.equal(input(requests[0]).settlesBefore, Date.parse("2026-11-06T05:00:00.000Z"));
  });

  test("names a merged book level's member from any venue prefix, and null when there is none", () => {
    const book = {
      bids: [
        { px: 0.5, sz: 10, source: "xyz:123" },
        { px: 0.4, sz: 5 },
      ],
      asks: [],
    };
    const { merged } = simplifyCluster({
      id: "c",
      title: "t",
      kind: "k",
      anchor: 1,
      members: [],
      mergedBook: book,
      mergedBookWithClose: null,
    });
    assert.deepEqual(
      merged.bids.map((l) => l.outcome),
      [123, null],
    );
  });

  test("runs once per input item and pairs every result with its item", async () => {
    const { output, requests } = await run(
      (i) => ({ resource: "market", operation: "getFairLine", outcome: [22091, 23762][i], simplify: true }),
      [ok(fixture("market").result.data), ok(fixture("market").result.data)],
      { items: 2 },
    );
    assert.equal(requests.length, 2);
    assert.deepEqual(
      output.map((o) => o.pairedItem),
      [{ item: 0 }, { item: 1 }],
    );
  });

  test("turns a server refusal into a NodeApiError with its message and status", async () => {
    await assert.rejects(
      run({ resource: "market", operation: "getFairLine", outcome: 999999999, simplify: true }, [
        fail(404, "No such market."),
      ]),
      (error) =>
        error instanceof NodeApiError && error.message === "No such market." && error.httpCode === "404",
    );
  });

  test("waits out a short rate limit and tries again", async () => {
    const { output, requests } = await run(
      { resource: "market", operation: "getNewest", limit: 1, simplify: true },
      [fail(429, "Too many requests. Try again in a second.", { "retry-after": "0" }), ok(edges.slice(0, 1))],
    );
    assert.equal(requests.length, 2);
    assert.equal(output.length, 1);
  });

  test("gives up at once when the wait asked for is long, and after three tries", async () => {
    const long = await run({ resource: "market", operation: "getNewest", limit: 1, simplify: true }, [
      fail(429, "Too many requests. Try again in a second.", { "retry-after": "3600" }),
    ]).catch((error) => error);
    assert.ok(long instanceof NodeApiError);
    assert.equal(long.httpCode, "429");
    assert.match(long.description, /30 requests a second/);

    const busy = fail(503, "Markets are still loading. Try again in a few seconds.", { "retry-after": "0" });
    await assert.rejects(
      run({ resource: "market", operation: "getNewest", limit: 1, simplify: true }, [busy, busy, busy]),
      (error) => error instanceof NodeApiError && error.message.startsWith("Markets are still loading"),
    );
  });

  test("reports a network failure as a NodeApiError that names the API", async () => {
    const params = { resource: "market", operation: "getNewest", limit: 1, simplify: true };
    const dns = Object.assign(new Error("getaddrinfo ENOTFOUND api.usehyperodds.com"), { code: "ENOTFOUND" });
    await assert.rejects(
      run(params, [dns]),
      (e) => e instanceof NodeApiError && /connection cannot be established/.test(e.message),
    );
    await assert.rejects(
      run(params, [new Error("socket hang up")]),
      (e) =>
        e instanceof NodeApiError &&
        e.message === "Could not reach Hyperodds" &&
        e.description.includes("https://api.usehyperodds.com"),
    );
  });

  test("with Continue On Fail, a failed item becomes an error item and the rest still run", async () => {
    const { output } = await run(
      (i) => ({ resource: "market", operation: "getFairLine", outcome: [1, 22091][i], simplify: true }),
      [fail(404, "No such market."), ok(fixture("market").result.data)],
      { items: 2, continueOnFail: true },
    );
    assert.deepEqual(output[0], { json: { error: "No such market." }, pairedItem: { item: 0 } });
    assert.equal(output[1].json.outcome, 22091);
  });

  test("names only the field the operation used when Hyperodds finds nothing", async () => {
    const cases = [
      [
        { resource: "market", operation: "getFairLine", outcome: 0, simplify: true },
        "No such market.",
        "Outcome ID",
      ],
      [
        { resource: "cluster", operation: "get", lookUpBy: "outcome", outcome: 0, simplify: true },
        "No such market.",
        "Outcome ID",
      ],
      [
        { resource: "cluster", operation: "get", lookUpBy: "id", clusterId: "nope", simplify: true },
        "No such cluster.",
        "Cluster ID",
      ],
    ];
    for (const [params, message, field] of cases) {
      const error = await run(params, [fail(404, message)]).catch((e) => e);
      assert.ok(error instanceof NodeApiError);
      assert.equal(error.message, message);
      assert.ok(error.description.includes(`'${field}'`), error.description);
      assert.ok(
        !error.description.includes(field === "Outcome ID" ? "Cluster ID" : "Outcome ID"),
        error.description,
      );
    }
    const list = await run({ resource: "market", operation: "getNewest", limit: 5, output: "simplified" }, [
      fail(404, "No procedure found"),
    ]).catch((e) => e);
    assert.equal(list.description, undefined);
  });

  test("refuses an outcome ID that is not a whole number before calling the server", async () => {
    for (const outcome of [-1, 1.5, "abc", "", null]) {
      const { requests } = await run(
        { resource: "market", operation: "getFairLine", outcome, simplify: true },
        [],
        { continueOnFail: true },
      );
      assert.equal(requests.length, 0);
    }
  });

  test("removes control, zero-width and bidi characters from deployer text", async () => {
    const tricky = { ...edges[0], title: "HYPE‮ above​ 86\u0007 now" };
    const { output } = await run({ resource: "market", operation: "getNewest", limit: 1, simplify: true }, [
      ok([tricky]),
    ]);
    assert.equal(output[0].json.title, "HYPE above 86  now");
  });

  test("lists deployers for the Deployer filter from markets.facets", async () => {
    const requests = [];
    const ctx = {
      getNode: () => ({ name: "Hyperodds" }),
      helpers: {
        httpRequest: async (options) => {
          requests.push(options);
          return ok(fixture("facets").result.data);
        },
      },
    };
    const options = await new Hyperodds().methods.loadOptions.getDeployers.call(ctx);
    assert.equal(requests[0].url, "https://api.usehyperodds.com/trpc/markets.facets");
    assert.equal(requests[0].qs, undefined);
    assert.deepEqual(options[0], { name: "Outcome (out)", value: "out", description: "199 live markets" });
  });
});
