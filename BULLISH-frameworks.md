# Bullish 7: frameworks

**Hyperodds tools for Vercel's AI SDK, LangChain and the OpenAI Agents SDK.**

Three npm packages put the four read-only Hyperodds tools (`odds_markets`, `odds_new`, `odds_fair`,
`odds_cluster`) into the three most used TypeScript agent frameworks, each through its own tool API.
They are built by us on each framework's public tool interface and read the hosted MCP server at
`https://api.usehyperodds.com/mcp`. No partnership with Vercel, LangChain or OpenAI is implied.

## What works now

On branch `bullish/frameworks` of `hyperodds-agents`, all checks green (`npm run lint`,
`npm run typecheck`, `npm test`: 40 tests).

| Package                    | What it gives                                                                      | Tested against                                              |
| -------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `@hyperodds/client`        | MCP client over Streamable HTTP (fetch only), tool catalog with Zod schemas, types | the hosted server, and a stand-in for every failure         |
| `@hyperodds/ai-sdk`        | `hyperoddsTools()`: a typed AI SDK tool set                                        | `ai` 7.0.159 (full suite), `ai` 6.0.320 (runtime and types) |
| `@hyperodds/langchain`     | `hyperoddsTools()`: four `DynamicStructuredTool`s                                  | `@langchain/core` 1.3.2 (full suite) and 1.0.0              |
| `@hyperodds/openai-agents` | `hyperoddsTools()`: four strict function tools                                     | `@openai/agents` 0.21.0                                     |
- Frameworks and Zod are peer dependencies (`ai ^6 || ^7`, `@langchain/core ^1`,
  `@openai/agents >=0.21 <1`, `zod ^4.1.8`). The client is the only runtime dependency of the
  three framework packages, and it has none of its own.
- Every tool keeps the hosted server's name, inputs and limits. A catalog test compares each input
  schema with the server's recorded `tools/list`; the demo compares against the live list.
- The framework tests run each framework's real agent loop with a scripted model: `generateText`
  with `MockLanguageModelV4`, `createAgent` with `fakeModel`, and the Agents SDK `run` with a
  scripted `Model`. They prove the model's call reaches Hyperodds, the result comes back to the
  model, a refusal reaches the model with the server's reason, and input the schema rejects never
  leaves the machine.
- OpenAI strict mode: optional inputs become nullable for the model, and the nulls are dropped
  before the call. Refusals reach the model by name in place of the SDK's generic error text.
- Text written by deployers (titles, rule notes) comes back with control, zero-width and bidi
  override characters removed before a model reads it.
- The client negotiates the MCP protocol once per instance, shares that handshake across
  concurrent calls (one caller's abort cannot fail the others), reads JSON or event-stream answers,
  and names the cause of every failure: refusal, rate limit, HTTP status, timeout or network.
- Dependencies were installed with `npm install --before=2026-11-01`, so every package in the lock
  file was public for at least four days. Pinned dev versions: `ai` 7.0.159 (Oct 30),
  `@ai-sdk/openai` 4.0.106 (Oct 30), `@langchain/core` 1.3.2 (Oct 29), `langchain` 1.6.0 and
  `@langchain/openai` 1.8.0 (Oct 28), `@openai/agents` 0.21.0 (Oct 20), `zod` 4.6.7 (Oct 12),
  `typescript` 7.0.2 and `@biomejs/biome` 2.6.2 as in `hyperodds-mcp`.

## What is prepared, not done

- The GitHub repository `usehyperodds/hyperodds-agents` (does not exist yet; package metadata,
  README links, issue templates and the release workflow point to it).
- npm publication of the four packages under the `@hyperodds` scope (owned by
  `developerhyperodds`, which published `@hyperodds/mcp`).
- CI (`.github/workflows/ci.yml`: Node 22 and 24 on Linux, 24 on Windows) and a tag-driven release
  workflow that publishes the client first, then the framework packages, all with provenance.

## Run the demo

No model and no key. From the repository root, with Node.js 22.18 or later:

```sh
npm ci
npm run demo
```

It lists the live tools, then runs every tool through each package the way that framework executes
a model's tool call (AI SDK `execute`, a LangChain tool call that returns a `ToolMessage`, an
Agents SDK `invoke` with the nulls a strict model sends), and prints the answers: 13 tool calls,
about 2 seconds. Run end to end on 2026-11-04 at 23:41 UTC; the screenshots are that run.

The examples ask a real model, with the user's key:

```sh
OPENAI_API_KEY=sk-... node examples/ai-sdk.ts "Which HIP-4 markets show the biggest edge right now?"
OPENAI_API_KEY=sk-... node examples/langchain.ts "Is the next Fed decision priced the same on every deployer?"
OPENAI_API_KEY=sk-... node examples/openai-agents.ts "What was listed in the last hour?"
```

We have no OpenAI key, so each example was run against a local OpenAI-compatible stand-in
(`OPENAI_BASE_URL=http://127.0.0.1:4797/v1`) that called `odds_markets` and then answered from the
tool output. All three completed: the AI SDK and Agents SDK through the Responses API, LangChain
through Chat Completions, with real production data in the answer. The stand-in lives outside the
repository; the model's wording in a real run is the model's.

## Operator actions

1. Create the public repository `usehyperodds/hyperodds-agents` on GitHub (empty, MIT, default
   branch `main`), merge `bullish/frameworks` into `main` and push it. Add the `NPM_TOKEN` secret
   (an npm automation token for `developerhyperodds`), the same as `hyperodds-mcp` uses.
2. Publish, either from CI with provenance (preferred, matches `@hyperodds/mcp`):

   ```sh
   git tag v0.1.0 && git push origin v0.1.0
   ```

   or from this machine, logged in as `developerhyperodds` (`npm whoami`), without provenance:

   ```sh
   npm ci && npm run lint && npm run typecheck && npm test
   npm publish --workspace packages/client --access public
   npm publish --workspace packages/ai-sdk --access public
   npm publish --workspace packages/langchain --access public
   npm publish --workspace packages/openai-agents --access public
   ```

   The client must go first: the other three depend on `@hyperodds/client@0.1.0`.
3. Check the four pages on npmjs.com, then run one example with a real OpenAI key and keep the
   output for a reply under the post.
4. Post the announcement below, with `docs/bullish/frameworks/quickstart.png` and the GitHub link in
   the first reply.

## Honest limits

- No run with a real model yet (no key here). Wiring is proven by the scripted-model tests and the
  stand-in runs above; answer quality depends on the user's model.
- The tool inputs are written into the packages. If the hosted server changes a tool's inputs, the
  packages need a release; the catalog test and the demo catch the drift.
- Each IP address gets 1,000 tool calls a day; an agent that loops can use them up. The refusal names
  the limit and reaches the model.
- `@openai/agents` is pre-1.0 and was tested on 0.21.0 only; a later 0.x release could change the
  tool API. AI SDK and LangChain ranges are tested at both ends named above.
- ESM only, Node.js 22 or later (22.18 for running the TypeScript examples directly).
- Removing hidden characters narrows prompt injection through market titles; it cannot stop a
  model from following plain text. SECURITY.md says so.
- Sports markets often have no fair line, so the demo's Agents SDK block shows a crypto market's
  line when the sports page has none.

## Links

- Branch: `hyperodds-agents`, `bullish/frameworks`
- Packages: `packages/client`, `packages/ai-sdk`, `packages/langchain`, `packages/openai-agents`
- Demo: `scripts/demo.ts`; examples: `examples/`
- Assets: `docs/bullish/frameworks/quickstart.png`, `demo-ai-sdk.png`, `demo-langchain.png`,
  `demo-openai-agents.png` (1440×900)
- Hosted server: https://api.usehyperodds.com/mcp; guide: https://usehyperodds.com/docs/mcp
- Framework docs used: https://ai-sdk.dev/docs/foundations/tools,
  https://docs.langchain.com/oss/javascript/langchain/tools, https://openai.github.io/openai-agents-js/guides/tools
- After publishing: https://www.npmjs.com/package/@hyperodds/ai-sdk,
  https://www.npmjs.com/package/@hyperodds/langchain,
  https://www.npmjs.com/package/@hyperodds/openai-agents, https://github.com/usehyperodds/hyperodds-agents

## Announcement

Post only after the packages are on npm.

**One line**

Hyperodds tools for Vercel's AI SDK, LangChain and the OpenAI Agents SDK: one import gives your
agent every HIP-4 market on Hyperliquid.

**One paragraph**

Agents built with Vercel's AI SDK, LangChain.js or the OpenAI Agents SDK can now read Hyperliquid's
HIP-4 outcome markets. Add `hyperoddsTools()` to your agent and it can list markets from every
deployer, check a fair line against its sources, see the edge after fees and compare the rules when
several deployers list the same question. The tools are read-only, typed and free, with no
Hyperodds key to set up.

**Post**

> Hyperodds tools for Vercel's AI SDK, LangChain and the OpenAI Agents SDK.
>
> One import gives your agent every HIP-4 market on Hyperliquid, with fair lines, their sources and
> the edge after fees.
>
> npm i @hyperodds/ai-sdk
> npm i @hyperodds/langchain
> npm i @hyperodds/openai-agents
>
> Read-only. No Hyperodds key.

First reply: `github.com/usehyperodds/hyperodds-agents`, with `demo-ai-sdk.png`.
