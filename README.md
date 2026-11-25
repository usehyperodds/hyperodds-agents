# Hyperodds tools for AI agents

Give an agent built with Vercel's AI SDK, LangChain.js or the OpenAI Agents SDK live data on
Hyperliquid's HIP-4 outcome markets from every deployer: books, fair lines with their sources, edges
after fees, rule comparisons where several deployers list the same question, the newest listings,
and Hyperodds' public forecast record. Free, with no Hyperodds key to set up.

| Package                    | Works with                             | Install                                             |
| -------------------------- | -------------------------------------- | --------------------------------------------------- |
| `@hyperodds/ai-sdk`        | Vercel AI SDK 6 and 7                  | `npm i @hyperodds/ai-sdk ai zod`                    |
| `@hyperodds/langchain`     | LangChain.js 1.x, LangGraph            | `npm i @hyperodds/langchain @langchain/core zod`    |
| `@hyperodds/openai-agents` | OpenAI Agents SDK for TypeScript 0.21+ | `npm i @hyperodds/openai-agents @openai/agents zod` |
| `@hyperodds/client`        | Any TypeScript or JavaScript           | `npm i @hyperodds/client zod`                       |
| `n8n-nodes-hyperodds`      | n8n, self-hosted (tested on 2.46.3)    | Settings → Community nodes → `n8n-nodes-hyperodds`  |

The four `@hyperodds` packages call the hosted Hyperodds MCP server at `api.usehyperodds.com/mcp`
over HTTPS, where the tools and their data run. The tools are read-only: none can trade, access an
account or enter a forecast. They need Node.js 22 or later and Zod 4. For workflows, see [n8n](#n8n).

## Quick start

The snippets are ES modules with top-level `await`: run them as `.mjs` files or in a project whose
`package.json` sets `"type": "module"`.

Vercel AI SDK, with `npm i @hyperodds/ai-sdk ai @ai-sdk/openai zod`:

```ts
import { openai } from "@ai-sdk/openai";
import { hyperoddsTools, instructions } from "@hyperodds/ai-sdk";
import { generateText, stepCountIs } from "ai";

const { text } = await generateText({
  model: openai("gpt-5.4-mini"),
  system: instructions,
  tools: hyperoddsTools(),
  stopWhen: stepCountIs(8),
  prompt: "Which HIP-4 markets show the biggest edge after fees right now?",
});
```

LangChain.js, with `npm i @hyperodds/langchain @langchain/core @langchain/openai langchain zod`:

```ts
import { hyperoddsTools, instructions } from "@hyperodds/langchain";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";

const agent = createAgent({
  model: new ChatOpenAI({ model: "gpt-5.4-mini" }),
  tools: hyperoddsTools(),
  systemPrompt: instructions,
});
const { messages } = await agent.invoke({
  messages: [{ role: "user", content: "Is the next Fed decision priced the same on every deployer?" }],
});
```

OpenAI Agents SDK, with `npm i @hyperodds/openai-agents @openai/agents zod`:

```ts
import { hyperoddsTools, instructions } from "@hyperodds/openai-agents";
import { Agent, run } from "@openai/agents";

const agent = new Agent({ name: "HIP-4 analyst", instructions, tools: hyperoddsTools() });
const result = await run(agent, "What was listed in the last hour?");
console.log(result.finalOutput);
```

`instructions` is a short system prompt that tells the model how to read the numbers. Any tool-calling model
your framework supports can use the tools; these use OpenAI so that one key runs all three.

To bundle the AI SDK or the OpenAI Agents SDK into one ES module with esbuild, add
`--banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"`,
since both load Node.js built-ins with `require`.

## Tools

| Tool                   | Input                                                                                                                  | Output                                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `search`               | `query`, the words of a question                                                                                       | Up to 20 markets that match, each with its id and its page to cite                                                                                                       |
| `fetch`                | `id`, from `search`                                                                                                    | One market in full as text written to be quoted: book, volume, fair line and sources, edges, settlement rules, the same question elsewhere; plus its fields              |
| `odds_markets`         | `category`, `deployer`, `sort` (`volume`, `edge`, `new`, `settling`), `q`, `minEdgePts`, `limit` (up to 100), `offset` | Markets with bid, ask, fair line, best buy edge after fees, 24h volume in contracts, kind, status, start and settlement times, plus how many match in total              |
| `odds_new`             | `category`, `limit` (up to 100), `offset`                                                                              | Markets in listing order, newest first, with the same fields as `odds_markets`                                                                                           |
| `odds_fair`            | `outcome`                                                                                                              | One market's fair line: probability and band, method, confidence and flags, each source with its venue, weight and age, plus the book and the edge for each way to trade |
| `odds_cluster`         | `id`, or the `outcome` of any member                                                                                   | One question listed by several deployers: each member's rule grade (`SAME`, `CLOSE` or `DIFFERENT`), the differences found and the merged book                           |
| `odds_leaderboard`     | `limit` (up to 100), `offset`                                                                                          | The forecast record's board: forecasters ranked by skill over the fair line, with the fair line and the market price as baselines                                        |
| `odds_forecast_record` | `address`, `limit`, `offset`, `draft`                                                                                  | One forecaster's public record: their board row, forecasts past their cutoff with result and score, and how many are still private                                       |

The hosted server has one more tool, `odds_forecast`, which records a forecast signed by the
forecaster's own key. It writes, so these packages leave it out; the
[agents guide](https://usehyperodds.com/docs/agents) covers entering forecasts.

The tools take the same names and inputs as the hosted MCP server, so an agent calls them the same
way through these packages, through [`@hyperodds/mcp`](https://github.com/usehyperodds/hyperodds-mcp)
or through a client connected to the server directly. The tool descriptions a model reads are the
server's own. Results come back as typed objects, with control and zero-width characters removed
from the text deployers write.

## Try it without a model

```sh
git clone https://github.com/usehyperodds/hyperodds-agents.git
cd hyperodds-agents
npm ci
npm run demo
```

The demo runs every tool through each package against the hosted server, the way each framework
executes a model's tool call, and prints the answers. It needs no key. `odds_cluster` runs only when
one of the busiest markets is also listed by another deployer; the demo says when none is.

The [examples](examples) ask a model a question with each framework. They take your OpenAI key, and
`OPENAI_MODEL` picks another model. Without a key, a scripted stand-in makes the one tool call and
reads the live result back, so you can watch the framework's loop run; it is not a model.

```sh
OPENAI_API_KEY=sk-... node examples/ai-sdk.ts "Which HIP-4 markets show the biggest edge right now?"
OPENAI_API_KEY=sk-... node examples/langchain.ts "Is the next Fed decision priced the same on every deployer?"
OPENAI_API_KEY=sk-... node examples/openai-agents.ts "What was listed in the last hour?"
```

## Reading the numbers

Prices are decimals from 0 to 1 for a market's first side, often Yes. Edges are percentage points
after every fee, including the fee Hyperliquid takes at settlement, for a $100 order: 2.9 means
2.9¢ a contract. An edge is null when $100 would not fill. `fetch` writes prices in cents: 62¢ is
0.62. Volume counts contracts, each paying $1 if its side wins.

A market's `kind` says what it asks, such as `price_binary`, `contest_winner` or `policy_rate`.
`starts` is a game's start or a decision's time. A price market settles at `settlesAt`; any other
market settles by `settlesBy`, the latest it can; `settles` gives whichever applies. Every answer
carries `asOf`, the time it was put together.

Price markets take their fair line from Deribit, Bybit and Cboe option surfaces, or from realized
volatility on Hyperliquid perps. Sports and events take theirs from matched Polymarket and Kalshi
quotes. Fair lines are estimates, and two fields say how far to trust one: `fairConfidence`, from 0
to 1, and `singleSource`, true when one quote sets the line. A line read from an option surface
counts as more than one quote, since the surface prices every strike.

In `odds_fair` the same two fields are `fair.confidence` and `fair.singleSource`.

`sort: "edge"` lists first the markets Hyperodds trusts an edge on: a fair line with a
`fairConfidence` of at least 0.5 that rests on more than one quote (`singleSource` false), on a
book quoted on both sides with a spread of at most 10 points and dollars resting within 5 points of
the mid on each side. They come largest edge first. Every other market follows, most traded first,
so check both fields before acting on any edge. `minEdgePts` keeps only the trusted lines with an
edge of at least that many points.

`odds_markets` and `odds_new` leave out the "Other" outcome that some multi-outcome questions list
as a fallback. The [MCP guide](https://usehyperodds.com/docs/mcp) explains the other fields.

## Options

Every `hyperoddsTools()` takes the same options, all optional:

| Option      | Default                            | Purpose                                                            |
| ----------- | ---------------------------------- | ------------------------------------------------------------------ |
| `url`       | `https://api.usehyperodds.com/mcp` | The MCP server to read                                             |
| `timeoutMs` | `30000`                            | How long to wait for each answer                                   |
| `userAgent` | none                               | Goes ahead of the package's user agent, to tell your traffic apart |
| `fetch`     | `globalThis.fetch`                 | A fetch to use instead, for a proxy or a test                      |
| `client`    | a new client                       | A `Hyperodds` client to share between tool sets                    |

When Hyperodds refuses a call, such as an unknown outcome id or a used-up allowance, the error
names the reason and each framework passes it to the model.

## Limits

Each IP address gets 1,000 market tool calls a day, reset at 00:00 UTC; the two forecast record
tools don't count toward it. Past the allowance a call comes back as a tool error that names the
reset time, which the model reads; with `@hyperodds/client` the thrown `HyperoddsError` also
carries `limit`, with `limit`, `used` and `resetAt`. Every request also counts toward a rate limit
of 5 a second, with bursts of up to 30. When the server asks for a wait of 5 seconds or less, the
client waits and tries once more; it does the same after a dropped connection or a failed gateway.

## n8n

[`n8n-nodes-hyperodds`](packages/n8n-nodes-hyperodds) brings the same markets to n8n workflows:
1. In n8n, open **Settings → Community nodes → Install** and enter `n8n-nodes-hyperodds`.
2. Add **Hyperodds** to read markets, such as Get Top Edges, or **Hyperodds Trigger** to start a
   workflow from an alert you send to the Webhook channel on the Hyperodds Alerts page.

The reads need no account or key. The trigger checks each request's signature against your signing
secret before the workflow starts. The package's [README](packages/n8n-nodes-hyperodds/README.md)
covers setup, the payload and the signature check, and [examples/n8n](examples/n8n) has two
workflows to import.

## Development

```sh
npm ci
npm ci --prefix packages/n8n-nodes-hyperodds
npm test
```

The second install is for the n8n nodes, which keep their own lock file; the demo and the examples
need only the first. `npm run lint` and `npm run typecheck` run the other checks CI runs. See
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

Report vulnerabilities privately to security@usehyperodds.com, or through
[the repository's Security tab](https://github.com/usehyperodds/hyperodds-agents/security/advisories/new).
[SECURITY.md](SECURITY.md) has the details.

## License

[MIT](LICENSE). Third-party names identify compatible frameworks and data sources; Hyperodds is not
affiliated with any of them.
