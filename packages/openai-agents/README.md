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

`hyperoddsTools()` returns four strict function tools, `odds_markets`, `odds_new`, `odds_fair` and
`odds_cluster`. Strict mode makes the model send every field, with null for the ones it leaves out;
the SDK drops those nulls before the call reaches Hyperodds. `instructions` tells the model how to
read prices, fair lines and edges.

When Hyperodds refuses a call, such as an unknown outcome id or a used-up allowance, the model reads
the reason in place of the SDK's generic error text. The tools take `url`, `timeoutMs`,
`userAgent`, `fetch` and a shared `client`.

Works with `@openai/agents` 0.21 and later 0.x releases and Zod 4, on Node.js 22 or later. The
tools, the numbers and the daily allowance are described in the
[repository README](https://github.com/usehyperodds/hyperodds-agents#readme).

MIT licensed. Hyperodds is not affiliated with OpenAI.
