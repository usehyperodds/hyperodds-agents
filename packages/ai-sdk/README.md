# @hyperodds/ai-sdk

Hyperodds tools for [Vercel's AI SDK](https://ai-sdk.dev): live, read-only data on Hyperliquid's
HIP-4 outcome markets from every deployer, for `generateText`, `streamText` and agents. Free, with
no Hyperodds key.

```sh
npm i @hyperodds/ai-sdk ai zod
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

`hyperoddsTools()` returns a tool set with `odds_markets`, `odds_new`, `odds_fair` and
`odds_cluster`. Each tool's input is a Zod schema with a description for every field, and its
output is typed, so `result.toolResults` comes back with the market fields your code expects.
Merge it with your own tools as you would any tool set: `tools: { ...hyperoddsTools(), ...mine }`.
`instructions` tells the model how to read prices, fair lines and edges.

A refused call, such as an unknown outcome id, reaches the model as a tool error that names the
reason. The tool set takes `url`, `timeoutMs`, `userAgent`, `fetch` and a shared `client`.

Works with AI SDK 6 and 7 and Zod 4, on Node.js 22 or later. The tools, the numbers and the daily
allowance are described in the [repository README](https://github.com/usehyperodds/hyperodds-agents#readme).

MIT licensed. Hyperodds is not affiliated with Vercel.
