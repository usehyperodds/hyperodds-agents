# Changelog

Notable changes to `@hyperodds/client`, `@hyperodds/ai-sdk`, `@hyperodds/langchain` and
`@hyperodds/openai-agents`, newest first. The four share one version, which follows
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-05

### Added

- `@hyperodds/ai-sdk`: the four read-only Hyperodds tools as an AI SDK tool set, typed input and
  output, for AI SDK 6 and 7.
- `@hyperodds/langchain`: the same tools as LangChain structured tools, for `createAgent`,
  `bindTools` and LangGraph.
- `@hyperodds/openai-agents`: the same tools as strict function tools for the OpenAI Agents SDK,
  with refusals passed to the model by name.
- `@hyperodds/client`: an MCP client for the hosted server over Streamable HTTP, the tool catalog
  with its Zod input schemas, the result types and `instructions`, a system prompt line on reading
  the numbers.
- Text written by deployers comes back with control, zero-width and bidirectional formatting
  characters removed.
- The client tries a call once more when the server asks to wait 5 seconds or less, or after a
  dropped connection or a failed gateway.
- `npm run demo` runs every tool through each package against the hosted server; the examples ask
  a model with each framework.

[0.1.0]: https://github.com/usehyperodds/hyperodds-agents/releases/tag/v0.1.0
