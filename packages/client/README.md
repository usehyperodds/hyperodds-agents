# @hyperodds/client

A small client for the hosted Hyperodds MCP server, with the schemas and descriptions of its
read-only tools on Hyperliquid's HIP-4 outcome markets. It is the shared core of
[`@hyperodds/ai-sdk`](https://www.npmjs.com/package/@hyperodds/ai-sdk),
[`@hyperodds/langchain`](https://www.npmjs.com/package/@hyperodds/langchain) and
[`@hyperodds/openai-agents`](https://www.npmjs.com/package/@hyperodds/openai-agents); use it
directly to read the same data from your own code or to wrap the tools for another framework.

```sh
npm i @hyperodds/client zod
```

```ts
import { Hyperodds } from "@hyperodds/client";

const hyperodds = new Hyperodds();
const { markets } = await hyperodds.markets({ sort: "edge", limit: 5 });
const top = markets[0];
if (top) {
  console.log(top.title, top.edgePts, top.fairConfidence, top.singleSource);
  const line = await hyperodds.fair({ outcome: top.outcome });
  console.log(line.fair?.p, line.fair?.confidence, line.fair?.singleSource, line.edge?.buy0);
}
```

The snippet is an ES module with top-level `await`: run it as a `.mjs` file or in a project whose
`package.json` sets `"type": "module"`.

| Method                        | Tool                   | Returns                                                          |
| ----------------------------- | ---------------------- | ---------------------------------------------------------------- |
| `search({ query })`           | `search`               | Markets that match the words of a question, with pages to cite   |
| `read({ id })`                | `fetch`                | One market in full, as text written to be quoted, and its fields |
| `markets(input)`              | `odds_markets`         | Markets with book, fair line and edge after fees                 |
| `newest(input)`               | `odds_new`             | Markets newest first                                             |
| `fair({ outcome })`           | `odds_fair`            | One market's fair line with its sources, book and edges          |
| `cluster({ id \| outcome })`  | `odds_cluster`         | One question across deployers, with rule grades and merged book  |
| `leaderboard(input)`          | `odds_leaderboard`     | The forecast record's board, with its two baselines              |
| `forecastRecord({ address })` | `odds_forecast_record` | One forecaster's public record                                   |
| `listTools()`                 |                        | The tools as the server describes them                           |

A market in `markets()` and `newest()` carries `outcome`, `title`, `deployer`, `deployerName`,
`category`, `kind`, `status`, `sides`, `bid`, `ask`, `fair`, `fairConfidence`, `singleSource`,
`edgePts`, `edgeSide`, `volume24h` (contracts), `starts`, `settlesAt`, `settlesBy`, `settles`,
`listed`, `clusterId` and `url`; the list adds `asOf`, `total` and `count`. Here `fair` is a
number, the line's probability.

`fair()` nests the same line with its detail: `fair.p`, `fair.lo` and `fair.hi` (the line and its
band), `fair.method`, `fair.confidence`, `fair.singleSource`, `fair.flags`, `fair.sources` (each with
`venue`, `label`, `name`, `p`, `weight` and `ageS`), `fair.updated` and `fair.ageS`. Next to it come `book.bid`,
`book.ask` and `book.mid`, and `edge.refUsd` with `edge.buy0`, `edge.buy1`, `edge.sell0` and
`edge.sell1`. `fair` and `edge` are null when Hyperodds has no line for the market.

Every method takes `{ signal }` to cancel. A refused call throws a `HyperoddsError` with the
server's reason. When the day's allowance is used up, the error also carries `limit`, with `limit`,
`used` and `resetAt`. The server's `odds_forecast` tool writes to the forecast record and is not in
the catalog; `call(name, args)` reaches it, and is never sent twice. `tools` holds each tool's description and Zod input schema, `runTool` runs one
the way a model calls it, and `instructions` is a system prompt line on reading the numbers.

The client speaks MCP over Streamable HTTP with `fetch`, and Zod is its one peer dependency. It negotiates
the protocol once, then sends each call as one POST. Options: `url`, `timeoutMs` (default 30
seconds), `userAgent` and `fetch`.

Node.js 22 or later. MIT licensed. The tools, the numbers and the daily allowance are described in
the [repository README](https://github.com/usehyperodds/hyperodds-agents#readme).
