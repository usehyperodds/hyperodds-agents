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
const line = await hyperodds.fair({ outcome: markets[0].outcome });
```

| Method                       | Tool           | Returns                                                         |
| ---------------------------- | -------------- | --------------------------------------------------------------- |
| `markets(input)`             | `odds_markets` | Markets with book, fair line and edge after fees                |
| `newest(input)`              | `odds_new`     | Markets newest first                                            |
| `fair({ outcome })`          | `odds_fair`    | One market's fair line with its sources, book and edges         |
| `cluster({ id \| outcome })` | `odds_cluster` | One question across deployers, with rule grades and merged book |
| `listTools()`                |                | The tools as the server describes them                          |

Every method takes `{ signal }` to cancel. A refused call throws a `HyperoddsError` with the
server's reason. `tools` holds each tool's description and Zod input schema, `runTool` runs one
the way a model calls it, and `instructions` is a system prompt line on reading the numbers.

The client speaks MCP over Streamable HTTP with `fetch`, and Zod is its one peer dependency. It negotiates
the protocol once, then sends each call as one POST. Options: `url`, `timeoutMs` (default 30
seconds), `userAgent` and `fetch`.

Node.js 22 or later. MIT licensed. The tools, the numbers and the daily allowance are described in
the [repository README](https://github.com/usehyperodds/hyperodds-agents#readme).
