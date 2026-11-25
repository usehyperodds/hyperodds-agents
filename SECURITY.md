# Security

## Reporting a vulnerability

Please report security problems privately, not in a public issue. Either:
- use **Report a vulnerability** under this repository's
  [Security tab](https://github.com/usehyperodds/hyperodds-agents/security/advisories/new), or
- email security@usehyperodds.com.

Include what you found, how to reproduce it and what an attacker could do with it. We aim to
reply within three working days, keep you updated while we fix it, and credit you in the advisory
unless you would rather we did not.

## Scope

- The packages in this repository: `@hyperodds/client`, `@hyperodds/ai-sdk`,
  `@hyperodds/langchain`, `@hyperodds/openai-agents` and `n8n-nodes-hyperodds`.
- The hosted endpoints they call, `https://api.usehyperodds.com/mcp` and the public read API at
  `https://api.usehyperodds.com/trpc`.
- The Hyperodds Trigger's signature check: a request it accepts without a valid
  `hyperodds-signature` from your signing secret, or a way to replay a signed request outside the
  five-minute window, is in scope.

Market titles and rules are written by HIP-4 deployers and reach your model as tool output. The
packages strip control, zero-width and bidirectional formatting characters from that text, which
narrows what a hostile title can hide. They cannot make a model ignore instructions written in
plain text, so treat tool output as data in your own prompts too. A way past the cleaning is in
scope; a model following plain text is not.

Issues in Hyperliquid, the frameworks or other third parties belong with them.

## Supported versions

Fixes go into the latest release of each package.
