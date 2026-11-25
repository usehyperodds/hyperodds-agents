# Contributing

Thanks for helping. This repository holds the Hyperodds tool packages for agent frameworks,
`@hyperodds/client`, `@hyperodds/ai-sdk`, `@hyperodds/langchain` and `@hyperodds/openai-agents`,
and the Hyperodds nodes for n8n, `n8n-nodes-hyperodds`.
- A bug in a package, a framework version it does not work with, or a gap in these docs: open an
  issue or a pull request here.
- A tool's output, a missing field or a new tool: open a
  [feature request](https://github.com/usehyperodds/hyperodds-agents/issues/new?template=feature_request.yml).
  Those changes ship on the hosted server first; the packages follow when a tool's inputs change.

## Set up

You need Node.js 22.18 or later, which runs the TypeScript examples and the demo directly.

```sh
git clone https://github.com/usehyperodds/hyperodds-agents.git
cd hyperodds-agents
npm ci
npm ci --prefix packages/n8n-nodes-hyperodds
npm test
```

`packages/n8n-nodes-hyperodds` sits outside the npm workspaces with its own lock file: n8n's node
CLI builds and lints it with TypeScript 5 and ESLint, while the other packages use TypeScript 7.
The root scripts run its checks too.

`npm test` builds every package and runs the tests with Node's own test runner. The tests use a
stand-in for the hosted server, and the framework tests run real agent loops (`generateText`,
`createAgent`, `run`) with scripted models, so they need no network and no key. `npm run lint`
checks formatting and lint rules with Biome (`npm run format` fixes what it can), and
`npm run typecheck` runs TypeScript over the packages, the examples and the demo.

`npm run demo` calls every tool against the hosted server through each package. Run it when you
change how a package calls a tool or reads its result.

## Layout

- `packages/client`: the MCP client, the tool catalog (names, descriptions, Zod input schemas) and
  the result types. The framework packages build on it.
- `packages/ai-sdk`, `packages/langchain`, `packages/openai-agents`: one thin wrapper each.
- `examples`: one script per framework that asks a model a question.
- `scripts/demo.ts`: the demo.
- `packages/n8n-nodes-hyperodds`: the n8n nodes, laid out as n8n's node CLI expects (`nodes/`,
  `credentials/`, `icons/`). `npm run lint` there runs n8n's community node rules; keep its
  `eslint.config.mjs` as n8n ships it, since n8n's verification checks it. `scripts/local-n8n.sh`
  runs a local n8n with the package installed, and `scripts/send-test-alert.mjs` signs a webhook
  delivery the way Hyperodds does.

The catalog tests compare the tool inputs with `packages/client/test/fixtures/tools-list.json`, the
hosted server's `tools/list`. When the server changes a tool, refresh that file and the catalog
together.

## Pull requests

- Keep each pull request to one change, with a test that fails without it.
- Keep framework packages as peer dependencies; a package must never bundle the framework it
  plugs into.
- Write commit messages in the imperative, short and lowercase: `pass the abort signal to fetch`.
- Describe how you tested it, including the framework and Node.js versions if they matter.

By contributing, you agree to release your work under the [MIT license](LICENSE) and to follow the
[code of conduct](CODE_OF_CONDUCT.md).

## Releases

`n8n-nodes-hyperodds` is versioned on its own: bump `version` in its `package.json`, add the entry to
its [CHANGELOG.md](packages/n8n-nodes-hyperodds/CHANGELOG.md) and push an `n8n-vX.Y.Z` tag. The
`publish n8n nodes` workflow publishes it with npm provenance, which n8n requires for verification.

The four `@hyperodds` packages share one version. Maintainers release from `main`: bump `version` in each
package's `package.json`, the `@hyperodds/client` dependency of the other three and
`packages/client/src/version.ts`, add the entry
to [CHANGELOG.md](CHANGELOG.md) and push a `vX.Y.Z` tag. The release workflow checks the tag
against every package, publishes `@hyperodds/client` first and the framework packages after it,
all with npm provenance, and opens the GitHub release from the changelog entry.
