# Changelog

Notable changes to `@hyperodds/client`, `@hyperodds/ai-sdk`, `@hyperodds/langchain` and
`@hyperodds/openai-agents`, newest first. The four share one version, which follows
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-25

### Added

- `@hyperodds/ai-sdk`: the eight read-only Hyperodds tools as an AI SDK tool set, typed input and
  output, for AI SDK 6 and 7.
- `@hyperodds/langchain`: the same tools as LangChain structured tools, for `createAgent`,
  `bindTools` and LangGraph.
- `@hyperodds/openai-agents`: the same tools as strict function tools for the OpenAI Agents SDK,
  with refusals passed to the model by name.
- `@hyperodds/client`: an MCP client for the hosted server over Streamable HTTP, the tool catalog
  with its Zod input schemas, the result types and `instructions`, a system prompt line on reading
  the numbers.
- The tools: `search` and `fetch` to find a market from the words of a question and read it in
  full, `odds_markets`, `odds_new`, `odds_fair` and `odds_cluster` for the market data, and
  `odds_leaderboard` and `odds_forecast_record` for the public forecast record. The server's
  writing tool, `odds_forecast`, is left out.
- A used-up daily allowance arrives as a tool error; `HyperoddsError.limit` gives the limit, the
  count and the reset time.
- Text written by deployers comes back with control, zero-width and bidirectional formatting
  characters removed.
- The client tries a call once more when the server asks to wait 5 seconds or less, or after a
  dropped connection or a failed gateway.
- `npm run demo` runs every tool through each package against the hosted server; the examples ask
  a model with each framework, or run a scripted stand-in when no key is set.

[0.1.0]: https://github.com/usehyperodds/hyperodds-agents/releases/tag/v0.1.0
