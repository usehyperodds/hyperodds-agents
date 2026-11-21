# @hyperodds/ai-sdk

Hyperodds tools for [Vercel's AI SDK](https://ai-sdk.dev): live, read-only data on Hyperliquid's
HIP-4 outcome markets from every deployer, for `generateText`, `streamText` and agents. Free, with
no Hyperodds key.

```sh
npm i @hyperodds/ai-sdk ai @ai-sdk/openai zod
```

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

The snippet is an ES module with top-level `await`: run it as a `.mjs` file or in a project whose
`package.json` sets `"type": "module"`.

`hyperoddsTools()` returns a tool set with `odds_markets`, `odds_new`, `odds_fair` and
`odds_cluster`. Each tool's input is a Zod schema with a description for every field, and its
output is typed. A step's `toolResults` can also hold dynamic tools, whose output is `unknown`, so
skip those to read a typed result:

```ts
const { steps } = await generateText({ model, tools: hyperoddsTools(), prompt });
for (const result of steps.flatMap((step) => step.toolResults)) {
  if (result.dynamic) continue;
  if (result.toolName === "odds_markets") console.log(result.output.markets[0]?.title);
}
```

Merge it with your own tools as you would any tool set: `tools: { ...hyperoddsTools(), ...mine }`.
`instructions` tells the model how to read prices, fair lines and edges.

A refused call, such as an unknown outcome id, reaches the model as a tool error that names the
reason. The tool set takes `url`, `timeoutMs`, `userAgent`, `fetch` and a shared `client`.

To bundle your app into one ES module with esbuild, add
`--banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"`,
since the AI SDK loads Node.js built-ins with `require`.

Works with AI SDK 6 and 7 and Zod 4, on Node.js 22 or later. The tools, the numbers and the daily
allowance are described in the [repository README](https://github.com/usehyperodds/hyperodds-agents#readme).

MIT licensed. Hyperodds is not affiliated with Vercel.
