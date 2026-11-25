import type {
  IDataObject,
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodePropertyOptions,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import { NodeApiError, NodeConnectionTypes, NodeOperationError, tryToParseDateTime } from "n8n-workflow";
import { query } from "./api";
import { properties } from "./properties";
import {
  type ClusterView,
  clean,
  FALLBACK,
  fullMarket,
  type MarketDetail,
  pick,
  rawMarket,
  SIMPLIFIED,
  type Summary,
  simplifyCluster,
  simplifyFairLine,
} from "./shape";

export class Hyperodds implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Hyperodds",
    name: "hyperodds",
    icon: { light: "file:../../icons/hyperodds.svg", dark: "file:../../icons/hyperodds.dark.svg" },
    group: ["input"],
    version: 1,
    subtitle:
      '={{ { getAll: "Markets", getNewest: "Newest markets", getEdges: "Top edges after fees", getFairLine: "Fair line", get: "Question across deployers" }[$parameter["operation"]] }}',
    description:
      "Read Hyperliquid HIP-4 outcome markets from every deployer: books, fair lines, edges after fees and rule comparisons",
    defaults: { name: "Hyperodds" },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    properties,
  };

  methods = {
    loadOptions: {
      async getDeployers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        const facets = await query<{ deployers: { key: string; name: string; n: number }[] }>(
          this,
          "markets.facets",
        );
        return clean(facets.deployers).map((d) => ({
          name: `${d.name} (${d.key})`,
          value: d.key,
          description: `${d.n} live markets`,
        }));
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const results = await run(this, i);
        for (const json of results) returnData.push({ json: clean(json), pairedItem: { item: i } });
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
          continue;
        }
        throw error instanceof NodeApiError
          ? error
          : new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
      }
    }

    return [returnData];
  }
}

async function run(ctx: IExecuteFunctions, i: number): Promise<IDataObject[]> {
  const resource = ctx.getNodeParameter("resource", i) as string;
  const operation = ctx.getNodeParameter("operation", i) as string;
  if (resource === "cluster" && operation === "get") {
    const simplify = ctx.getNodeParameter("simplify", i, true) as boolean;
    const cluster = await getCluster(ctx, i);
    return [simplify ? simplifyCluster(cluster) : (cluster as unknown as IDataObject)];
  }
  if (resource !== "market") {
    throw new NodeOperationError(ctx.getNode(), `Unknown resource: ${resource}`, { itemIndex: i });
  }

  const market = marketOutput(ctx, i);
  switch (operation) {
    case "getAll": {
      const input: IDataObject = { sort: ctx.getNodeParameter("sort", i), ...filters(ctx, i) };
      const limit = ctx.getNodeParameter("returnAll", i)
        ? undefined
        : (ctx.getNodeParameter("limit", i) as number);
      if (withOther(ctx, i)) {
        if (limit !== undefined) input.limit = limit;
        return (await query<Summary[]>(ctx, "markets.list", input, i)).map(market);
      }
      // The server cannot leave the fallback outcomes out, so the limit applies after they go.
      const markets = (await query<Summary[]>(ctx, "markets.list", input, i)).filter(listed);
      return markets.slice(0, limit).map(market);
    }
    case "getNewest": {
      const limit = ctx.getNodeParameter("limit", i) as number;
      if (withOther(ctx, i)) return (await query<Summary[]>(ctx, "markets.newest", { limit }, i)).map(market);
      const markets = await query<Summary[]>(ctx, "markets.newest", { limit: NEWEST_MAX }, i);
      return markets.filter(listed).slice(0, limit).map(market);
    }
    case "getEdges": {
      const input = {
        limit: ctx.getNodeParameter("limit", i),
        minConfidence: ctx.getNodeParameter("minConfidence", i),
      };
      return (await query<Summary[]>(ctx, "markets.edges", input, i)).map(market);
    }
    case "getFairLine": {
      const simplify = ctx.getNodeParameter("simplify", i, true) as boolean;
      const outcome = outcomeId(ctx, i);
      const detail = await query<MarketDetail>(ctx, "markets.get", { outcome }, i, NO_MARKET);
      return [simplify ? simplifyFairLine(detail) : { ...detail, url: rawMarket(detail.summary).url }];
    }
  }
  throw new NodeOperationError(ctx.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
}

const NEWEST_MAX = 200;
const NO_MARKET = "Hyperodds lists no market with that ID. Check 'Outcome ID'.";
const NO_CLUSTER = "Hyperodds lists no cluster with that ID. Check 'Cluster ID'.";

// The MCP tools leave out the "Other" outcome a multi-outcome question lists as its fallback.
const listed = (m: Summary) => m.role !== FALLBACK;
const withOther = (ctx: IExecuteFunctions, i: number) =>
  ctx.getNodeParameter("includeOther", i, false) as boolean;

function marketOutput(ctx: IExecuteFunctions, i: number): (m: Summary) => IDataObject {
  const output = ctx.getNodeParameter("output", i, "simplified") as string;
  if (output === "raw") return rawMarket;
  if (output === "simplified") return (m) => pick(fullMarket(m), SIMPLIFIED);
  const fields = ctx.getNodeParameter("fields", i, []) as string[];
  return (m) => pick(fullMarket(m), ["outcome", ...fields.filter((f) => f !== "outcome")]);
}

async function getCluster(ctx: IExecuteFunctions, i: number): Promise<ClusterView> {
  if (ctx.getNodeParameter("lookUpBy", i) === "id") {
    const id = (ctx.getNodeParameter("clusterId", i) as string).trim();
    if (!id) throw new NodeOperationError(ctx.getNode(), "'Cluster ID' is empty", { itemIndex: i });
    return await query<ClusterView>(ctx, "clusters.get", { id }, i, NO_CLUSTER);
  }
  const outcome = outcomeId(ctx, i);
  const { cluster } = await query<MarketDetail>(ctx, "markets.get", { outcome }, i, NO_MARKET);
  if (!cluster) {
    throw new NodeOperationError(
      ctx.getNode(),
      `Outcome ${outcome} is listed by one deployer only, so it has no cluster.`,
      { itemIndex: i },
    );
  }
  return cluster;
}

function outcomeId(ctx: IExecuteFunctions, i: number): number {
  const value = ctx.getNodeParameter("outcome", i);
  // Number("") is 0, a real outcome ID, so an empty field must not reach the server as one.
  if (value === "" || value === null || value === undefined) {
    throw new NodeOperationError(ctx.getNode(), "'Outcome ID' is empty", { itemIndex: i });
  }
  const outcome = Number(value);
  if (!Number.isInteger(outcome) || outcome < 0) {
    throw new NodeOperationError(ctx.getNode(), "'Outcome ID' must be a whole number of 0 or more", {
      itemIndex: i,
    });
  }
  return outcome;
}

function filters(ctx: IExecuteFunctions, i: number): IDataObject {
  const f = ctx.getNodeParameter("filters", i, {}) as IDataObject;
  const input: IDataObject = {};
  if (f.category) input.category = f.category;
  if (typeof f.deployer === "string" && f.deployer.trim()) input.deployer = f.deployer.trim();
  if (typeof f.q === "string" && f.q.trim()) input.q = f.q.trim();
  for (const key of ["minEdgePts", "minVolume", "minDepthUsd"] as const) {
    if (typeof f[key] === "number") input[key] = f[key];
  }
  if (f.includeSettled === true) input.includeSettled = true;
  if (f.settlesBefore) {
    // A date picked without a zone is read in the workflow's time zone, as n8n's own nodes read it.
    try {
      input.settlesBefore = tryToParseDateTime(f.settlesBefore, ctx.getTimezone()).toMillis();
    } catch {
      throw new NodeOperationError(ctx.getNode(), `'Settles Before' is not a date: ${f.settlesBefore}`, {
        itemIndex: i,
      });
    }
  }
  return input;
}
