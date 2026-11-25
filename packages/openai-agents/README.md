# @hyperodds/openai-agents

Hyperodds tools for the [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/): live,
read-only data on Hyperliquid's HIP-4 outcome markets from every deployer. Free, with no Hyperodds
key.

```sh
npm i @hyperodds/openai-agents @openai/agents zod
```

```ts
import { hyperoddsTools, instructions } from "@hyperodds/openai-agents";
import { Agent, run } from "@openai/agents";

const agent = new Agent({ name: "HIP-4 analyst", instructions, tools: hyperoddsTools() });
const result = await run(agent, "What was listed in the last hour?");
console.log(result.finalOutput);
```

The snippet is an ES module with top-level `await`: run it as a `.mjs` file or in a project whose
`package.json` sets `"type": "module"`.

`hyperoddsTools()` returns eight strict function tools: `search`, `fetch`, `odds_markets`,
`odds_new`, `odds_fair`, `odds_cluster`, `odds_leaderboard` and `odds_forecast_record`. Strict mode makes the model send every field, with null for the ones it leaves out;
the SDK drops those nulls before the call reaches Hyperodds. `instructions` tells the model how to
read prices, fair lines and edges.

When Hyperodds refuses a call, such as an unknown outcome id or a used-up allowance, the model reads
the reason in place of the SDK's generic error text. The tools take `url`, `timeoutMs`,
`userAgent`, `fetch` and a shared `client`.

To bundle your app into one ES module with esbuild, add
`--banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"`,
since the Agents SDK loads Node.js built-ins with `require`.

Works with `@openai/agents` 0.21 and later 0.x releases and Zod 4, on Node.js 22 or later. The
tools, the numbers and the daily allowance are described in the
[repository README](https://github.com/usehyperodds/hyperodds-agents#readme).

MIT licensed. Hyperodds is not affiliated with OpenAI.
