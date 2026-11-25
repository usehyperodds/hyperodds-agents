#!/usr/bin/env node
// Sends one signed Hyperodds webhook delivery, built and signed the way Hyperodds does it, so a
// receiver can be tested without an alert firing. No dependencies; Node.js 20 or later.
//
//   node scripts/send-test-alert.mjs <url> <signing secret> [type] [flags]
//
// type: alert.edge (default), alert.new_market, alert.settling, alert.rule_change,
//       alert.volume_spike or test
// --id <uuid>      reuse a delivery ID, as a retry does
// --stale          sign with a timestamp 6 minutes old
// --wrong-secret   sign with a different secret
// --tamper         change the body after signing it
// --no-signature   leave the signature header out
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: "string" },
    stale: { type: "boolean", default: false },
    "wrong-secret": { type: "boolean", default: false },
    tamper: { type: "boolean", default: false },
    "no-signature": { type: "boolean", default: false },
  },
});
const [url, secret, type = "alert.edge"] = positionals;
if (!url || !secret) {
  console.error("usage: node scripts/send-test-alert.mjs <url> <signing secret> [type] [flags]");
  process.exit(2);
}

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const market = (outcome, title) => ({ outcome, title, url: `https://usehyperodds.com/m/${outcome}` });
const alert = (kind) => ({ id: randomUUID(), kind });

const samples = {
  "alert.edge": {
    alert: alert("edge"),
    market: market(11844, "HYPE touches 95 by Dec 1 00:00 UTC"),
    title: "Edge +4.2 pts",
    text: "HYPE touches 95 by Dec 1 00:00 UTC (Outcome): +4.2 pts No · 59.1¢, fair 63.4¢ (options). After all fees, at $100.",
    note: "Edge after all fees, on a $100 order.",
    facts: [
      { label: "Buy", value: "No at 59.1¢" },
      { label: "Fair line", value: "63.4¢ from options" },
      { label: "Deployer", value: "Outcome" },
    ],
    data: {
      edge_pts: 4.2,
      side: "No",
      buy_price: 0.591,
      fair_price: 0.634,
      fair_method: "options",
      deployer: "Outcome",
      order_usd: 100,
    },
  },
  "alert.new_market": {
    alert: alert("new_market"),
    market: market(25877, "Minnesota Timberwolves vs Utah Jazz"),
    title: "New market on HIP-4",
    text: "Minnesota Timberwolves vs Utah Jazz · Outcome · starts Nov 7 02:00 UTC · settles by Nov 8 02:00 UTC",
    note: "",
    facts: [
      { label: "Deployer", value: "Outcome" },
      { label: "Starts", value: "Nov 7 02:00 UTC" },
      { label: "Settles by", value: "Nov 8 02:00 UTC" },
    ],
    data: {
      deployer: "Outcome",
      starts_at: "2026-11-07T02:00:00.000Z",
      settles_at: null,
      settles_by: "2026-11-08T02:00:00.000Z",
      outcomes: 1,
    },
  },
  "alert.settling": {
    alert: alert("settling"),
    market: market(23762, "HYPE above 86.2 at Nov 6 21:00 UTC"),
    title: "Settles in 58 min",
    text: "HYPE above 86.2 at Nov 6 21:00 UTC · trade[XYZ] · settles Nov 6 21:00 UTC · mid 20.9¢",
    note: "",
    facts: [
      { label: "Settles", value: "Nov 6 21:00 UTC" },
      { label: "Deployer", value: "trade[XYZ]" },
      { label: "Mid price", value: "20.9¢" },
    ],
    data: {
      starts_at: null,
      settles_at: "2026-11-06T21:00:00.000Z",
      settles_by: null,
      deployer: "trade[XYZ]",
      mid_price: 0.2086,
      markets: 1,
    },
  },
  "alert.rule_change": {
    alert: alert("rule_change"),
    market: market(22091, "HYPE touches 95 by Dec 1 00:00 UTC"),
    title: "Terms changed",
    text: "HYPE touches 95 by Dec 1 00:00 UTC: source: Hyperliquid mark → Hyperliquid oracle. Check the terms before you trade.",
    note: "Check the terms before you trade.",
    facts: [{ label: "Source", value: "Hyperliquid mark → Hyperliquid oracle" }],
    data: { changes: [{ field: "source", from: "Hyperliquid mark", to: "Hyperliquid oracle" }] },
  },
  "alert.volume_spike": {
    alert: alert("volume_spike"),
    market: market(8573, "Anthropic first-day market cap above $1,500B"),
    title: "Volume spike 6.2×",
    text: "Anthropic first-day market cap above $1,500B: 18.4k contracts traded in the last hour, 6.2× its hourly average.",
    note: "",
    facts: [
      { label: "Last hour", value: "18.4k contracts traded" },
      { label: "Pace", value: "6.2× its hourly average" },
      { label: "Deployer", value: "Outcome" },
    ],
    data: { volume_1h_contracts: 18400, ratio: 6.2, deployer: "Outcome" },
  },
  test: {
    alert: { id: null, kind: "edge" },
    market: { outcome: 0, title: "Example market", url: "https://usehyperodds.com/alerts" },
    title: "Test message: Edge +4.2 pts",
    text: "Hyperodds alerts will post to this URL. This example shows the fields of an edge alert. Choose Webhook for any alert on the Alerts page: https://usehyperodds.com/alerts",
    note: "Edge after all fees, on a $100 order.",
    facts: [
      { label: "Buy", value: "No at 59.1¢" },
      { label: "Fair line", value: "63.4¢ from options" },
      { label: "Deployer", value: "Example" },
    ],
    data: {
      edge_pts: 4.2,
      side: "No",
      buy_price: 0.591,
      fair_price: 0.634,
      fair_method: "options",
      deployer: "Example",
      order_usd: 100,
    },
  },
};

const sample = samples[type];
if (!sample) {
  console.error(`unknown type ${type}; use one of ${Object.keys(samples).join(", ")}`);
  process.exit(2);
}

const payload = {
  id: values.id ?? randomUUID(),
  type,
  created_at: iso(now),
  test: type === "test",
  ...sample,
};
const body = JSON.stringify(payload);
const t = Math.floor(now / 1000) - (values.stale ? 360 : 0);
const key = values["wrong-secret"] ? `hyperodds_sig_${randomBytes(32).toString("base64url")}` : secret;
const v1 = createHmac("sha256", key).update(`${t}.${body}`).digest("hex");
const sent = values.tamper ? body.replace(payload.title, `${payload.title}!`) : body;

const headers = {
  "content-type": "application/json",
  "user-agent": "Hyperodds-Webhooks/1 (+https://usehyperodds.com/docs/webhooks)",
  "hyperodds-event": type,
  "hyperodds-delivery": payload.id,
};
if (!values["no-signature"]) headers["hyperodds-signature"] = `t=${t},v1=${v1}`;

const res = await fetch(url, { method: "POST", headers, body: sent, redirect: "manual" });
console.log(`${type} ${payload.id} -> HTTP ${res.status} ${await res.text()}`);
process.exit(res.ok ? 0 : 1);
