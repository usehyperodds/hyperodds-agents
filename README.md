# Hyperodds tools for AI agents

Give an agent built with Vercel's AI SDK, LangChain.js or the OpenAI Agents SDK live data on
Hyperliquid's HIP-4 outcome markets from every deployer: books, fair lines with their sources, rule
comparisons where several deployers list the same question, and the newest listings. Free, with no
Hyperodds key to set up.

| Package                    | Works with                             | Install                                             |
| -------------------------- | -------------------------------------- | --------------------------------------------------- |
| `@hyperodds/ai-sdk`        | Vercel AI SDK 6 and 7                  | `npm i @hyperodds/ai-sdk ai zod`                    |
| `@hyperodds/langchain`     | LangChain.js 1.x, LangGraph            | `npm i @hyperodds/langchain @langchain/core zod`    |
| `@hyperodds/openai-agents` | OpenAI Agents SDK for TypeScript 0.21+ | `npm i @hyperodds/openai-agents @openai/agents zod` |
| `@hyperodds/client`        | Any TypeScript or JavaScript           | `npm i @hyperodds/client zod`                       |

Each package calls the hosted Hyperodds MCP server at `api.usehyperodds.com/mcp` over HTTPS, where
the tools and their data run. The tools are read-only: none can trade or access an account. The
packages need Node.js 22 or later and Zod 4.

## Quick start

Vercel AI SDK:

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

LangChain.js:

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

OpenAI Agents SDK:

```ts
import { hyperoddsTools, instructions } from "@hyperodds/openai-agents";
import { Agent, run } from "@openai/agents";

const agent = new Agent({ name: "HIP-4 analyst", instructions, tools: hyperoddsTools() });
const result = await run(agent, "What was listed in the last hour?");
console.log(result.finalOutput);
```

`instructions` is a short system prompt that tells the model how to read the numbers. Any tool-calling model
your framework supports can use the tools; these use OpenAI so that one key runs all three.

## Tools

| Tool           | Input                                                                                                    | Output                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `odds_markets` | `category`, `deployer`, `sort` (`volume`, `edge`, `new`, `settling`), `q`, `limit` (up to 100), `offset` | Markets with bid, ask, fair line, best buy edge after fees, 24h volume, event time and status, plus how many match in total                                                   |
| `odds_cluster` | `id`, or the `outcome` of any member                                                                     | One question listed by several deployers: each member's rule grade (`SAME`, `CLOSE` or `DIFFERENT`), the differences found and the merged book                                |
| `odds_fair`    | `outcome`                                                                                                | One market's fair line: probability and band, method, confidence and flags, each source with its weight and age, plus the book and the edge for buying or selling either side |
| `odds_new`     | `category`, `limit` (up to 100), `offset`                                                                | Markets in listing order, newest first, with the same fields as `odds_markets`                                                                                                |

The tools take the same names and inputs as the hosted MCP server, so an agent calls them the same
way through these packages, through [`@hyperodds/mcp`](https://github.com/usehyperodds/hyperodds-mcp)
or through a client connected to the server directly. The descriptions a model reads are written for
these packages. Results come back as typed objects, with control and zero-width characters removed
from the text deployers write.

## Try it without a model

```sh
git clone https://github.com/usehyperodds/hyperodds-agents.git
cd hyperodds-agents
npm ci
npm run demo
```

The demo runs every tool through each package against the hosted server, the way each framework
executes a model's tool call, and prints the answers. It needs no key.

The [examples](examples) ask a model a question with each framework. They take your OpenAI key, and
`OPENAI_MODEL` picks another model:

```sh
OPENAI_API_KEY=sk-... node examples/ai-sdk.ts "Which HIP-4 markets show the biggest edge right now?"
OPENAI_API_KEY=sk-... node examples/langchain.ts "Is the next Fed decision priced the same on every deployer?"
OPENAI_API_KEY=sk-... node examples/openai-agents.ts "What was listed in the last hour?"
```

## Reading the numbers

Prices are decimals from 0 to 1 for a market's first side, often Yes. Edges are percentage points
after every fee, including the fee Hyperliquid takes at settlement, for a $100 order: 2.9 means
2.9¢ a share. An edge is null when $100 would not fill.

Price markets take their fair line from Deribit, Bybit and Cboe option surfaces, or from realized
volatility on Hyperliquid perps. Sports and events take theirs from matched Polymarket and Kalshi
quotes. Fair lines are estimates, and two fields say how far to trust one: `fairConfidence`, from 0
to 1, and `singleSource`, true when one quote sets the line. A line read from an option surface
counts as more than one quote, since the surface prices every strike.

`sort: "edge"` puts first the markets whose line has a `fairConfidence` of at least 0.5 and more
than one quote, on a book with depth and a spread of at most 10 points, largest edge first. Every
other market follows, also largest edge first, so the biggest numbers on a page can sit on the
weakest lines. Check both fields before acting on any edge. The
[MCP guide](https://usehyperodds.com/docs/mcp) explains every field.

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

Each IP address gets 1,000 tool calls a day, reset at 00:00 UTC. Every request also counts toward
a rate limit of 5 a second, with bursts of up to 30. Past either limit, the server answers with an
error that names it. When it asks to wait 5 seconds or less, the client waits and tries once more,
as it does after a dropped connection or a failed gateway.

## Development

```sh
npm ci
npm test
```

`npm run lint` and `npm run typecheck` run the other checks CI runs. See
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

Report vulnerabilities privately to security@usehyperodds.com, or through
[the repository's Security tab](https://github.com/usehyperodds/hyperodds-agents/security/advisories/new).
[SECURITY.md](SECURITY.md) has the details.

## License

[MIT](LICENSE). Third-party names identify compatible frameworks and data sources; Hyperodds is not
affiliated with any of them.
