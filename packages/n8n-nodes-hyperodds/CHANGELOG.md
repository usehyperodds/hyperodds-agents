# Changelog

Notable changes to `n8n-nodes-hyperodds`, newest first. It follows
[Semantic Versioning](https://semver.org/) and is versioned apart from the `@hyperodds` packages.

## [0.1.0] - 2026-11-25

### Added

- **Hyperodds** node: top edges after fees, any filtered list of markets, the newest listings, one
  market's fair line with its sources, and one question compared across deployers. n8n's AI Agent
  can use it as a tool.
- Market items come simplified to ten fields, among them `fairConfidence` and `singleSource`, or as
  selected fields or raw, under the Hyperodds MCP tools' field names. Lists leave out the fallback
  "Other" outcomes unless asked for them, as the MCP tools do.
- **Hyperodds Trigger**: starts a workflow from an alert sent to the Webhook channel. Checks the
  `hyperodds-signature` HMAC over the raw body and a 5-minute timestamp window, filters by alert
  kind, and drops repeated deliveries by ID. It refuses every request until the credential holds a
  well-formed signing secret, and removes hidden characters from the alert's text.
- **Hyperodds Webhook API** credential for the signing secret, with a format check on save.
- `scripts/send-test-alert.mjs`, a reference sender that signs deliveries the way Hyperodds does,
  and `scripts/local-n8n.sh`, a local n8n with the package installed.

[0.1.0]: https://github.com/usehyperodds/hyperodds-agents/releases/tag/n8n-v0.1.0
