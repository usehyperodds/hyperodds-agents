# @hyperodds/langchain

Hyperodds tools for
[LangChain.js](https://docs.langchain.com/oss/javascript/langchain/overview): live, read-only data
on Hyperliquid's HIP-4 outcome markets from every deployer, for `createAgent`, `model.bindTools`
and LangGraph. Free, with no Hyperodds key.

```sh
npm i @hyperodds/langchain @langchain/core @langchain/openai langchain zod
```

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

The snippet is an ES module with top-level `await`: run it as a `.mjs` file or in a project whose
`package.json` sets `"type": "module"`.

`hyperoddsTools()` returns four structured tools, `odds_markets`, `odds_new`, `odds_fair` and
`odds_cluster`, each with a Zod schema that describes every field. A tool message carries the
result as JSON; called directly with `tool.invoke(args)`, a tool returns the typed object.
`instructions` tells the model how to read prices, fair lines and edges.

A refused call, such as an unknown outcome id, throws an error that names the reason, and the
agent's tool node hands it to the model. The tools take `url`, `timeoutMs`, `userAgent`, `fetch`
and a shared `client`.

Works with `@langchain/core` 1.x and Zod 4, on Node.js 22 or later. The tools, the numbers and the
daily allowance are described in the
[repository README](https://github.com/usehyperodds/hyperodds-agents#readme).

MIT licensed. Hyperodds is not affiliated with LangChain.
