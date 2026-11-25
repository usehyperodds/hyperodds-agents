# n8n-nodes-hyperodds

Hyperodds nodes for [n8n](https://n8n.io): read Hyperliquid HIP-4 outcome markets from every
deployer, and start a workflow when one of your Hyperodds alerts fires.
- **Hyperodds** reads markets: the biggest edges after fees, the newest listings, any filtered list,
  one market's fair line with its sources, and one question compared across deployers. It needs no
  account and no key.
- **Hyperodds Trigger** receives the alerts you send to the Webhook channel on the Hyperodds Alerts
  page, checks each request's signature and passes the alert on as one item.

Built on n8n's community node API and tested with n8n 2.46.3. The package lists `n8n-workflow` as
a peer at any version, as n8n requires of community nodes, so other n8n versions can install it
without having been tested.

## Install

In n8n, open **Settings → Community nodes → Install**, enter `n8n-nodes-hyperodds` and confirm.
This works on self-hosted n8n; n8n Cloud installs verified community nodes only. For manual
installs and queue mode, see
[n8n's guide](https://docs.n8n.io/integrations/community-nodes/installation-and-management/manual-installation).

## Hyperodds

| Resource | Operation     | Reads                                          | Inputs                                                                                                                                                                                                  |
| -------- | ------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Market   | Get Top Edges | `markets.edges`                                | Limit (1 to 100), Min Confidence (0 to 1, default 0.5)                                                                                                                                                  |
| Market   | Get Many      | `markets.list`                                 | Sort (volume, edge, new, settling), Return All or Limit (1 to 1,000), include Other outcomes, filters: category, deployer, search, min edge, min 24h volume, min depth, settles before, include settled |
| Market   | Get Newest    | `markets.newest`                               | Limit (1 to 200), include Other outcomes                                                                                                                                                                |
| Market   | Get Fair Line | `markets.get`                                  | Outcome ID                                                                                                                                                                                              |
| Cluster  | Get           | `markets.get` by outcome, `clusters.get` by ID | Outcome ID of any member, or the cluster ID                                                                                                                                                             |

The list operations return one item per market, in one of three shapes set by **Output**:
- **Simplified** (the default): ten fields per market, as n8n's guidelines ask.
- **Selected Fields**: the fields you pick, plus the outcome ID.
- **Raw**: the server's full market summary, with depth, the last trade and settlement risk.

Every field has the name and precision the [Hyperodds MCP tools](https://usehyperodds.com/docs/mcp)
use, and that page explains each one. A simplified item:

```json
{
  "outcome": 37392,
  "title": "ETH above 1,636 at Nov 23 08:00 UTC",
  "bid": 0.6424,
  "ask": 0.6704,
  "fair": 0.7839,
  "fairConfidence": 0.9,
  "singleSource": false,
  "edgePts": 11.24,
  "edgeSide": 0,
  "url": "https://usehyperodds.com/m/37392"
}
```

Selected Fields adds any of `deployer`, `deployerName`, `category`, `status`, `sides`, `volume24h`,
`settles`, `listed` and `clusterId`.

Prices and fair lines are the probability of the first side, from 0 to 1. `edgePts` is the best buy
edge in percentage points after every fee for a $100 order, on side `edgeSide` (0 for the first of
`sides`, usually Yes): 11.24 means 11.24¢ a share. A fair line is an estimate: `fairConfidence`, from
0 to 1, says how far to trust it, and `singleSource` is true when one quote sets it. A line read
from an option surface counts as more than one quote, since the surface prices every strike.

**Get Top Edges** keeps only the edges Hyperodds trusts. A market makes the list when its fair line
rests on more than one quote with a confidence of at least **Min Confidence**, its book is quoted on
both sides with a spread of at most 10 points and dollars resting within 5 points of the mid on each
side, and its best buy edge is at least 0.5 points after fees. The list runs largest edge first.

**Get Many** and **Get Newest** leave out the "Other" outcome some multi-outcome questions list for
when no named outcome wins, as the Hyperodds MCP tools do. Turn on **Include Other Outcomes** to
keep it. Sorting Get Many by edge puts first the markets that clear the Get Top Edges bar at a
confidence of 0.5, whatever the size of their edge, then every other market; each group runs
largest edge first.

Get Fair Line returns the line with its band, method, confidence and each source with its weight
and age, plus the top of book and the edge for buying or selling either side. With **Simplify** off
it returns the whole market as the server sends it, with the rules, the book and recent trades.

Cluster → Get returns every deployer's market for one question with its rule grade against the
anchor (`SAME`, `CLOSE` or `DIFFERENT`), the differences found, and the merged top of book. A market
only one deployer lists has no cluster, and the node says so.

n8n's AI Agent can also use the node as a tool. Text written by deployers (titles, rule notes)
comes back with control, zero-width and bidirectional formatting characters removed.

### Limits

The node reads `https://api.usehyperodds.com`, which allows 30 requests a second per address in
bursts of up to 120. When the server asks to wait 10 seconds or less (a rate limit, or markets still
loading after a restart), the node waits and tries again, up to three attempts. Anything else stops
the node with the server's message, or becomes an error item when **Continue On Fail** is on.

## Hyperodds Trigger

The trigger receives what the Webhook channel on the Hyperodds Alerts page sends. The steps below
name the Webhook card on that page.

### Set it up

1. Add the **Hyperodds Trigger** to a workflow.
2. Sign in on the [Alerts page](https://usehyperodds.com/alerts) with your wallet, find the
   **Webhook** card and press **Show** next to the signing secret. In the trigger, create a
   credential and paste the secret.
3. Publish the workflow, then copy the trigger's **Production URL** (under Webhook URLs).
4. Paste the URL on the Webhook card and choose **Add webhook**. Hyperodds sends a signed test
   message, and the run appears under the workflow's Executions.
5. Choose **Webhook** as a channel on each alert that should start the workflow.

**Send test** on the card sends another test message at any time.

### Options

- **Events**: every alert (the default), or only some kinds: Edge, New Market, Rule Change,
  Settling, Volume Spike. Kinds Hyperodds adds later arrive under every alert.
- **Include Test Messages** (on by default): whether test messages start the workflow. They are
  acknowledged either way.
- **Drop Repeated Deliveries** (on by default): Hyperodds retries a delivery it could not confirm
  with the same ID, so the trigger remembers the last 200 delivery IDs and acknowledges a repeat
  without starting the workflow again. n8n keeps that memory for published workflows only.

### What it answers

| Request                                               | Answer                                    | Workflow |
| ----------------------------------------------------- | ----------------------------------------- | -------- |
| Signed, a selected kind, a new delivery               | `200 {"received":true,"started":true}`    | Starts   |
| Signed, a kind not selected, or a test with tests off | `200 {"received":true,"started":false,…}` | No       |
| Signed, a delivery ID it already passed on            | `200 {"received":true,"started":false,…}` | No       |
| Missing, malformed or wrong signature                 | `401 {"error":…}`                         | No       |
| Timestamp more than 5 minutes from n8n's clock        | `401 {"error":…}`                         | No       |
| Signed, but the body has no `id` and `type`           | `400 {"error":…}`                         | No       |

It answers before the workflow runs, so a slow workflow never looks like a failed delivery.

### The alert

Each alert becomes one item: the JSON body as Hyperodds sent it, with control, zero-width and
bidirectional formatting characters removed from its text:

```json
{
  "id": "0d2c6c1e-5b0e-4a51-9a1f-2f5c3c8a9b10",
  "type": "alert.edge",
  "created_at": "2026-11-05T10:30:00.000Z",
  "test": false,
  "alert": { "id": "e2daef8f-39e0-41ba-a020-ac2f23944889", "kind": "edge" },
  "market": {
    "outcome": 11844,
    "title": "HYPE touches 95 by Dec 1 00:00 UTC",
    "url": "https://usehyperodds.com/m/11844"
  },
  "title": "Edge +4.2 pts",
  "text": "HYPE touches 95 by Dec 1 00:00 UTC (Outcome): +4.2 pts No · 59.1¢, fair 63.4¢ (options). After all fees, at $100.",
  "note": "Edge after all fees, on a $100 order.",
  "facts": [
    { "label": "Buy", "value": "No at 59.1¢" },
    { "label": "Fair line", "value": "63.4¢ from options" },
    { "label": "Deployer", "value": "Outcome" }
  ],
  "data": {
    "edge_pts": 4.2,
    "side": "No",
    "buy_price": 0.591,
    "fair_price": 0.634,
    "fair_method": "options",
    "deployer": "Outcome",
    "order_usd": 100
  }
}
```

`title`, `text` and `facts` are ready to post to a chat. `data` holds the numbers for each kind:

| `type`               | `data`                                                                                |
| -------------------- | ------------------------------------------------------------------------------------- |
| `alert.edge`         | `edge_pts`, `side`, `buy_price`, `fair_price`, `fair_method`, `deployer`, `order_usd` |
| `alert.new_market`   | `deployer`, `starts_at`, `settles_at`, `settles_by` (ISO 8601 or null), `outcomes`    |
| `alert.settling`     | `starts_at`, `settles_at`, `settles_by`, `deployer`, `mid_price` (or null), `markets` |
| `alert.rule_change`  | `changes`: a list of `{field, from, to}`                                              |
| `alert.volume_spike` | `volume_1h_contracts`, `ratio` (null after a quiet day), `deployer`                   |
| `test`               | an example edge alert's fields; `test` is true and `alert.id` is null                 |

Fields Hyperodds adds later pass through unchanged.

### How the signature is checked

Every request carries `hyperodds-signature: t=<unix seconds>,v1=<hex>`. The trigger computes
HMAC-SHA256 over `<t>.<raw body>`, keyed with the signing secret exactly as the Alerts page shows
it, compares it in constant time with each `v1` value, and accepts the request when one matches and
`t` is within 5 minutes of n8n's clock. It hashes the bytes n8n received, before any parsing.
Requests also carry `hyperodds-event` (the type) and `hyperodds-delivery` (the payload's `id`); the
trigger reads both from the signed body.

To try a receiver without waiting for an alert, `scripts/send-test-alert.mjs` in this package's
repository builds and signs a delivery the same way:

```sh
node scripts/send-test-alert.mjs <production URL> <signing secret> alert.edge
node scripts/send-test-alert.mjs <production URL> <signing secret> test --stale   # answered 401
```

## Credentials

**Hyperodds Webhook API** holds one field, the signing secret from the Webhook card on the
[Alerts page](https://usehyperodds.com/alerts). It starts with `hyperodds_sig_`, a prefix of
Hyperodds' own, so secret scanners do not take it for another service's key. Saving the credential
checks that format; the first signed test message proves the secret itself. The **Hyperodds** node
needs no credential.

## Example workflows

Import these from **Workflow menu → Import from file**:
- [`examples/n8n/top-edges.json`](https://github.com/usehyperodds/hyperodds-agents/blob/main/examples/n8n/top-edges.json):
  a manual run of Get Top Edges that lists up to five edges of at least 0.5 points after fees, on
  lines and books Hyperodds trusts.
- [`examples/n8n/alert-trigger.json`](https://github.com/usehyperodds/hyperodds-agents/blob/main/examples/n8n/alert-trigger.json):
  the trigger and a step that picks the event, headline, summary and market link from each alert.

## Development

```sh
npm ci
npm run build
npm run lint
npm test
```

`npm run lint` runs n8n's community node rules. `scripts/local-n8n.sh` runs a local n8n with this
package installed as a community package, in a folder of its own; the script's header lists the
steps.

## License

[MIT](LICENSE). n8n is a trademark of n8n GmbH; this package is built on its public community node
API and is not affiliated with n8n. Hyperliquid and the deployers named in market data are third
parties.
