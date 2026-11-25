import type { INodeProperties } from "n8n-workflow";

const categories = [
  { name: "Awards", value: "awards" },
  { name: "Commodities", value: "commodities" },
  { name: "Crypto", value: "crypto" },
  { name: "Equities", value: "equities" },
  { name: "Indices", value: "indices" },
  { name: "IPO", value: "ipo" },
  { name: "Macro", value: "macro" },
  { name: "Other", value: "other" },
  { name: "Sports", value: "sports" },
];

const show = (resource: string, operation: string[]) => ({ show: { resource: [resource], operation } });

const LISTS = ["getAll", "getNewest", "getEdges"];

const simplify = (operation: string[], resource: string): INodeProperties => ({
  displayName: "Simplify",
  name: "simplify",
  type: "boolean",
  default: true,
  displayOptions: show(resource, operation),
  description: "Whether to return a simplified version of the response instead of the raw data",
});

/** The market fields of the Hyperodds MCP tools, described at usehyperodds.com/docs/mcp. */
const marketFields = [
  ["ask", "Best ask for the first side, 0 to 1"],
  ["bid", "Best bid for the first side, 0 to 1"],
  ["category", "Sports, crypto, equities, commodities, indices, macro, IPO, awards or other"],
  ["clusterId", "The question's cluster when other deployers list it too, else null"],
  ["deployer", "Deployer code, such as out or txyz"],
  ["deployerName", "Deployer name, such as Outcome"],
  ["edgePts", "Best buy edge in points after every fee, on a $100 order"],
  ["edgeSide", "The side that edge is on: 0 for the first of sides, 1 for the second"],
  ["fair", "Fair line: the probability of the first side, 0 to 1"],
  ["fairConfidence", "How far to trust the fair line, 0 to 1"],
  ["listed", "When the market was listed"],
  ["outcome", "Outcome ID"],
  ["settles", "Event time, else the deadline"],
  ["sides", "The two side labels, such as Yes and No"],
  ["singleSource", "Whether one quote sets the fair line"],
  ["status", "Open, live (the event has started) or awaiting settlement"],
  ["title", "Market title"],
  ["url", "The market's page on the Hyperodds console"],
  ["volume24h", "Shares traded in the last 24 hours"],
].map(([value, description]) => ({ name: value!, value: value!, description }));

export const properties: INodeProperties[] = [
  {
    displayName: "Resource",
    name: "resource",
    type: "options",
    noDataExpression: true,
    options: [
      {
        name: "Market",
        value: "market",
        description: "A HIP-4 outcome market listed by one deployer",
      },
      {
        name: "Cluster",
        value: "cluster",
        description: "One question listed by several deployers",
      },
    ],
    default: "market",
  },
  {
    displayName: "Operation",
    name: "operation",
    type: "options",
    noDataExpression: true,
    displayOptions: { show: { resource: ["market"] } },
    options: [
      {
        name: "Get Fair Line",
        value: "getFairLine",
        description:
          "Get a market's fair line with its sources, the top of book and the edge for each way to trade",
        action: "Get market fair line",
      },
      {
        name: "Get Many",
        value: "getAll",
        description: "List markets from every deployer, filtered and sorted",
        action: "Get many markets",
      },
      {
        name: "Get Newest",
        value: "getNewest",
        description: "List the newest listings first",
        action: "Get newest markets",
      },
      {
        name: "Get Top Edges",
        value: "getEdges",
        description:
          "List buy edges of at least 0.5 points after every fee, on fair lines Hyperodds trusts and books someone can trade",
        action: "Get markets with top edges after fees",
      },
    ],
    default: "getEdges",
  },
  {
    displayName: "Operation",
    name: "operation",
    type: "options",
    noDataExpression: true,
    displayOptions: { show: { resource: ["cluster"] } },
    options: [
      {
        name: "Get",
        value: "get",
        description:
          "Compare one question across deployers: each market's rule grade against the anchor, its book, and the merged book",
        action: "Get cluster across deployers",
      },
    ],
    default: "get",
  },

  {
    displayName: "Return All",
    name: "returnAll",
    type: "boolean",
    default: false,
    displayOptions: show("market", ["getAll"]),
    description: "Whether to return all results or only up to a given limit",
  },
  {
    displayName: "Limit",
    name: "limit",
    type: "number",
    typeOptions: { minValue: 1, maxValue: 1000 },
    default: 50,
    displayOptions: { show: { resource: ["market"], operation: ["getAll"], returnAll: [false] } },
    description: "Max number of results to return",
  },
  {
    displayName: "Sort",
    name: "sort",
    type: "options",
    options: [
      {
        name: "Edge",
        value: "edge",
        description:
          "Markets whose edge Hyperodds trusts first, then the rest, each group by best buy edge after fees, highest first",
      },
      { name: "New", value: "new", description: "Newest listings first" },
      {
        name: "Settling",
        value: "settling",
        description: "Soonest to settle first: the event time, else the deadline",
      },
      { name: "Volume", value: "volume", description: "Most traded in the last 24 hours first" },
    ],
    default: "volume",
    displayOptions: show("market", ["getAll"]),
  },
  {
    displayName: "Filters",
    name: "filters",
    type: "collection",
    placeholder: "Add Filter",
    default: {},
    displayOptions: show("market", ["getAll"]),
    options: [
      {
        displayName: "Category",
        name: "category",
        type: "options",
        options: categories,
        default: "crypto",
      },
      {
        displayName: "Deployer Name or ID",
        name: "deployer",
        type: "options",
        typeOptions: { loadOptionsMethod: "getDeployers" },
        default: "",
        description:
          'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
      },
      {
        displayName: "Include Settled",
        name: "includeSettled",
        type: "boolean",
        default: false,
        description: "Whether to add settled and removed markets, which Hyperodds keeps for 6 hours",
      },
      {
        displayName: "Min Depth (USD)",
        name: "minDepthUsd",
        type: "number",
        typeOptions: { minValue: 0 },
        default: 0,
        description:
          "Only markets with at least this many dollars resting within 5 points of the mid on both sides",
      },
      {
        displayName: "Min Edge (Points)",
        name: "minEdgePts",
        type: "number",
        default: 0,
        description:
          "Only markets whose best buy edge after fees, on a $100 order, is at least this many points",
      },
      {
        displayName: "Min Volume (24h)",
        name: "minVolume",
        type: "number",
        typeOptions: { minValue: 0 },
        default: 0,
        description: "Only markets with at least this many contracts traded in the last 24 hours",
      },
      {
        displayName: "Search",
        name: "q",
        type: "string",
        default: "",
        placeholder: "e.g. bitcoin",
        description: "Text to find in the title, label, subcategory or deployer name, ignoring case",
      },
      {
        displayName: "Settles Before",
        name: "settlesBefore",
        type: "dateTime",
        default: "",
        description:
          "Only markets that settle at or before this time: the event time when there is one, else the deadline",
      },
    ],
  },

  {
    displayName: "Limit",
    name: "limit",
    type: "number",
    typeOptions: { minValue: 1, maxValue: 200 },
    default: 50,
    displayOptions: show("market", ["getNewest"]),
    description: "Max number of results to return",
  },

  {
    displayName: "Limit",
    name: "limit",
    type: "number",
    typeOptions: { minValue: 1, maxValue: 100 },
    default: 50,
    displayOptions: show("market", ["getEdges"]),
    description: "Max number of results to return",
  },
  {
    displayName: "Min Confidence",
    name: "minConfidence",
    type: "number",
    typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
    default: 0.5,
    displayOptions: show("market", ["getEdges"]),
    description:
      "Only fair lines Hyperodds trusts at least this much, from 0 to 1. Lines set by one quote, books not quoted on both sides within 10 points or with no dollars within 5 points of the mid, and edges under 0.5 points are always left out.",
  },

  {
    displayName: "Include Other Outcomes",
    name: "includeOther",
    type: "boolean",
    default: false,
    displayOptions: show("market", ["getAll", "getNewest"]),
    description:
      "Whether to add the 'Other' outcome some multi-outcome questions list for when no named outcome wins. The Hyperodds MCP tools leave it out.",
  },

  {
    displayName: "Outcome ID",
    name: "outcome",
    type: "number",
    typeOptions: { minValue: 0 },
    required: true,
    default: 0,
    displayOptions: show("market", ["getFairLine"]),
    description:
      "The market's outcome ID, as the list operations return it and as in its console URL: 12345 in usehyperodds.com/m/12345",
  },

  {
    displayName: "Look Up By",
    name: "lookUpBy",
    type: "options",
    options: [
      { name: "Outcome ID", value: "outcome", description: "Any market in the cluster" },
      { name: "Cluster ID", value: "id", description: "The clusterId field of a market" },
    ],
    default: "outcome",
    displayOptions: show("cluster", ["get"]),
  },
  {
    displayName: "Outcome ID",
    name: "outcome",
    type: "number",
    typeOptions: { minValue: 0 },
    required: true,
    default: 0,
    displayOptions: { show: { resource: ["cluster"], operation: ["get"], lookUpBy: ["outcome"] } },
    description: "The outcome ID of any market in the cluster",
  },
  {
    displayName: "Cluster ID",
    name: "clusterId",
    type: "string",
    required: true,
    default: "",
    displayOptions: { show: { resource: ["cluster"], operation: ["get"], lookUpBy: ["id"] } },
    description: "The clusterId field of a market",
  },

  {
    displayName: "Output",
    name: "output",
    type: "options",
    default: "simplified",
    displayOptions: show("market", LISTS),
    options: [
      {
        name: "Simplified",
        value: "simplified",
        description:
          "Ten fields per market: outcome, title, bid, ask, fair, fairConfidence, singleSource, edgePts, edgeSide and the console URL",
      },
      { name: "Raw", value: "raw", description: "The full market summary the server sends" },
      { name: "Selected Fields", value: "fields", description: "Only the fields you choose" },
    ],
  },
  {
    displayName: "Fields",
    name: "fields",
    type: "multiOptions",
    default: ["outcome", "title", "edgePts", "url"],
    displayOptions: { show: { resource: ["market"], operation: LISTS, output: ["fields"] } },
    options: marketFields,
    description: "The fields to return for each market. The outcome ID is always included.",
  },
  simplify(["getFairLine"], "market"),
  simplify(["get"], "cluster"),
];
