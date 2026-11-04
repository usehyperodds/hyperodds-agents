// Runs every Hyperodds tool against production through each package, the way each framework
// executes a model's tool call, and prints what comes back. No model and no key: npm run demo
import { hyperoddsTools as aiSdkTools } from "@hyperodds/ai-sdk";
import {
  type Cluster,
  tools as catalog,
  type FairLine,
  Hyperodds,
  type Market,
  type MarketList,
  type ToolName,
} from "@hyperodds/client";
import { hyperoddsTools as langchainTools } from "@hyperodds/langchain";
import { hyperoddsTools as agentsTools } from "@hyperodds/openai-agents";
import { RunContext, setTracingDisabled } from "@openai/agents";

setTracingDisabled(true);

type Args = Record<string, unknown>;
type Call = (name: ToolName, args: Args) => Promise<unknown>;

const client = new Hyperodds({ userAgent: "hyperodds-agents-demo" });
const ai = aiSdkTools({ client });
const lc = langchainTools({ client });
const oa = agentsTools({ client });
let calls = 0;
let id = 0;

const viaAiSdk: Call = async (name, args) =>
  ai[name].execute(args as never, { toolCallId: `call-${++id}`, messages: [], context: {} });

const viaLangChain: Call = async (name, args) => {
  const message = await lc
    .find((t) => t.name === name)!
    .invoke({ id: `call-${++id}`, name, args, type: "tool_call" });
  return JSON.parse(message.content as string);
};

// A strict model sends every property, with null for the ones it leaves out.
const viaAgents: Call = async (name, args) => {
  const strict = Object.fromEntries(Object.keys(catalog[name].input.shape).map((k) => [k, args[k] ?? null]));
  const result = await oa.find((t) => t.name === name)!.invoke(new RunContext(), JSON.stringify(strict));
  if (typeof result === "string") throw new Error(result);
  return result;
};

const tty = process.stdout.isTTY;
const bold = (s: string) => (tty ? `\x1b[1m${s}\x1b[22m` : s);
const dim = (s: string) => (tty ? `\x1b[2m${s}\x1b[22m` : s);
const px = (n: number | null) => (n === null ? "  -  " : n.toFixed(3));
const pts = (n: number | null) => (n === null ? "no fill" : `${n > 0 ? "+" : ""}${n.toFixed(2)}`);
const fit = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
const utc = (iso: string | null) =>
  iso ? `${iso.slice(5, 10)} ${iso.slice(11, 16)} UTC` : "before our records";
const call = (name: string, args: Args) => `  ${bold(name)} ${dim(JSON.stringify(args))}`;

function row(m: Pick<Market, "outcome" | "title" | "bid" | "ask">, tail: string) {
  return `    #${String(m.outcome).padEnd(6)} ${fit(m.title, 46)} bid ${px(m.bid)}  ask ${px(m.ask)}  ${tail}`;
}

interface Plan {
  label: string;
  via: Call;
  markets: Args;
  fresh: Args;
  cluster: (listed: Market[]) => Args | null;
}

async function block(plan: Plan, clustered: Market[], fallback: Market) {
  const run = async <T>(name: ToolName, args: Args) => {
    calls++;
    return (await plan.via(name, args)) as T;
  };
  console.log(`\n${bold(plan.label)}`);

  const markets = await run<MarketList>("odds_markets", plan.markets);
  console.log(`${call("odds_markets", plan.markets)}  ${markets.total} match`);
  for (const m of markets.markets) {
    const edge = m.edgeSide === null ? "" : `  ${pts(m.edgePts)} pts buying ${m.sides[m.edgeSide]}`;
    console.log(row(m, `fair ${px(m.fair)}${edge || `  settles ${utc(m.settles)}`}`));
  }

  const priced = markets.markets.find((m) => m.fair !== null) ?? fallback;
  const fairArgs = { outcome: priced.outcome };
  const line = await run<FairLine>("odds_fair", fairArgs);
  const f = line.fair;
  console.log(`${call("odds_fair", fairArgs)}  ${line.title}`);
  if (f) {
    console.log(
      `    fair ${px(f.p)} (${px(f.lo)} to ${px(f.hi)}) from ${f.method}, confidence ${f.confidence.toFixed(2)}`,
    );
    const sources = f.sources.map(
      (s) => `${s.name} ${px(s.p)} (${Math.round(s.weight * 100)}%, ${Math.round(s.ageS)}s old)`,
    );
    console.log(`    sources: ${sources.join(", ")}`);
  }
  if (line.edge) {
    const [a, b] = line.sides;
    const e = line.edge;
    console.log(
      `    edge at $${e.refUsd}: buy ${a} ${pts(e.buy0)}, buy ${b} ${pts(e.buy1)}, sell ${a} ${pts(e.sell0)}, sell ${b} ${pts(e.sell1)}`,
    );
  }

  const clusterArgs = plan.cluster(clustered);
  if (clusterArgs) {
    const cluster = await run<Cluster>("odds_cluster", clusterArgs);
    console.log(`${call("odds_cluster", clusterArgs)}  ${cluster.title}`);
    for (const m of cluster.members) {
      const diffs = m.diffs.filter((d) => d.severity !== "info").map((d) => d.field);
      const grade = `${m.grade}${diffs.length ? ` on ${diffs.join(", ")}` : ""}`;
      console.log(row(m, `${grade}, ${m.deployerName}`));
    }
  }

  const fresh = await run<MarketList>("odds_new", plan.fresh);
  console.log(`${call("odds_new", plan.fresh)}  newest first`);
  for (const m of fresh.markets) console.log(row(m, `${m.deployerName}, listed ${utc(m.listed)}`));
}

console.log(bold(`Hyperodds tools, live from ${client.url}`));
console.log(
  dim(
    `${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC. No model and no key: each package runs the calls a model would make.`,
  ),
);

const hosted = await client.listTools();
const differs = hosted.filter((t) => {
  const local = catalog[t.name as ToolName];
  const theirs = Object.keys(t.inputSchema.properties ?? {})
    .sort()
    .join();
  return !local || theirs !== Object.keys(local.input.shape).sort().join();
});
console.log(
  differs.length === 0 && hosted.length === Object.keys(catalog).length
    ? `The server lists ${hosted.map((t) => t.name).join(", ")}, all read-only, and the packages carry the same four.`
    : `The server's tools differ from the packages: ${differs.map((t) => t.name).join(", ") || "one is missing"}.`,
);

// One page of the most traded markets, to find questions listed by several deployers.
calls++;
const busiest = await client.markets({ sort: "volume", limit: 100 });
const clustered = [
  ...new Map(busiest.markets.filter((m) => m.clusterId).map((m) => [m.clusterId, m])).values(),
];
const fallback = busiest.markets.find((m) => m.fair !== null) ?? busiest.markets[0]!;

const plans: Plan[] = [
  {
    label: "Vercel AI SDK  @hyperodds/ai-sdk",
    via: viaAiSdk,
    markets: { sort: "edge", limit: 3 },
    fresh: { limit: 3 },
    cluster: (c) => (c[0] ? { id: c[0].clusterId } : null),
  },
  {
    label: "LangChain.js  @hyperodds/langchain",
    via: viaLangChain,
    markets: { category: "crypto", sort: "settling", limit: 3 },
    fresh: { category: "crypto", limit: 3 },
    cluster: (c) => (c[1] ? { outcome: c[1].outcome } : null),
  },
  {
    label: "OpenAI Agents SDK  @hyperodds/openai-agents",
    via: viaAgents,
    markets: { category: "sports", limit: 3 },
    fresh: { category: "sports", limit: 3 },
    cluster: (c) => (c[2] ? { id: c[2].clusterId } : null),
  },
];
for (const plan of plans) await block(plan, clustered, fallback);

console.log(`\n${calls} tool calls, every one answered by the hosted server.`);
