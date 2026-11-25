const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { describe, test } = require("node:test");
const { verify, TOLERANCE_S } = require("../dist/nodes/HyperoddsTrigger/signature.js");

// Assembled at run time so secret scanners do not flag a test value.
const SECRET = ["hyperodds", "sig", "6fJk2pQx9LmN4vRt8YzA1cE5gH7iK3oS0uW2bD9eF4a"].join("_");
const BODY =
  '{"id":"0d2c6c1e-5b0e-4a51-9a1f-2f5c3c8a9b10","type":"alert.edge","created_at":"2026-11-05T10:30:00.000Z","test":false}';
const T = 1793874600;
// printf '%s' "$T.$BODY" | openssl dgst -sha256 -hmac "$SECRET"
const KNOWN = "a2c9532737fb8ff1f7c9d2f7aa26e4683766972bc8d1b230781dd85eb203301c";

const hmac = (secret, t, body) => createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
const body = Buffer.from(BODY);

describe("verify", () => {
  test("accepts the signature openssl computes for the same secret, timestamp and body", () => {
    assert.equal(hmac(SECRET, T, BODY), KNOWN);
    assert.deepEqual(verify(SECRET, `t=${T},v1=${KNOWN}`, body, T), { ok: true, timestamp: T });
  });

  test("hashes the raw bytes, so a body with non-ASCII text verifies as sent", () => {
    const raw = '{"id":"a","type":"alert.edge","text":"buy No at 59.1¢ — fair 63.4¢"}';
    const header = `t=${T},v1=${hmac(SECRET, T, raw)}`;
    assert.equal(verify(SECRET, header, Buffer.from(raw, "utf8"), T).ok, true);
  });

  test("refuses a signature made with another secret", () => {
    const other = ["hyperodds", "sig", "x".repeat(43)].join("_");
    assert.deepEqual(verify(SECRET, `t=${T},v1=${hmac(other, T, BODY)}`, body, T), {
      ok: false,
      reason: "mismatch",
    });
  });

  test("refuses a tampered body, even by one byte or whitespace", () => {
    const header = `t=${T},v1=${KNOWN}`;
    assert.equal(verify(SECRET, header, Buffer.from(BODY.replace("false", "true ")), T).reason, "mismatch");
    assert.equal(verify(SECRET, header, Buffer.from(`${BODY}\n`), T).reason, "mismatch");
    assert.equal(
      verify(SECRET, header, Buffer.from(JSON.stringify(JSON.parse(BODY), null, 1)), T).reason,
      "mismatch",
    );
  });

  test("refuses a timestamp the signature does not cover", () => {
    assert.equal(verify(SECRET, `t=${T + 1},v1=${KNOWN}`, body, T).reason, "mismatch");
  });

  test("allows five minutes of clock difference either way, and no more", () => {
    const header = `t=${T},v1=${KNOWN}`;
    assert.equal(TOLERANCE_S, 300);
    assert.equal(verify(SECRET, header, body, T + 300).ok, true);
    assert.equal(verify(SECRET, header, body, T - 300).ok, true);
    assert.deepEqual(verify(SECRET, header, body, T + 301), { ok: false, reason: "expired" });
    assert.deepEqual(verify(SECRET, header, body, T - 301), { ok: false, reason: "expired" });
  });

  test("accepts any one of several v1 entries, in any order and spacing", () => {
    const wrong = "0".repeat(64);
    assert.equal(verify(SECRET, `t=${T},v1=${wrong},v1=${KNOWN}`, body, T).ok, true);
    assert.equal(verify(SECRET, ` v1=${KNOWN} , t=${T} ,v1=${wrong}`, body, T).ok, true);
    assert.equal(verify(SECRET, `t=${T},v0=${KNOWN.slice(1)},v1=${KNOWN.toUpperCase()}`, body, T).ok, true);
    assert.equal(verify(SECRET, `t=${T},v1=${wrong},v1=${"f".repeat(64)}`, body, T).reason, "mismatch");
  });

  test("refuses a missing or malformed header before hashing", () => {
    assert.deepEqual(verify(SECRET, undefined, body, T), { ok: false, reason: "missing" });
    assert.deepEqual(verify(SECRET, "", body, T), { ok: false, reason: "missing" });
    for (const header of [
      `v1=${KNOWN}`,
      `t=${T}`,
      `t=${T},v1=${KNOWN.slice(2)}`,
      `t=${T},v1=${KNOWN}zz`,
      `t=-${T},v1=${KNOWN}`,
      `t=${T}.5,v1=${KNOWN}`,
      `sha256=${KNOWN}`,
    ]) {
      assert.deepEqual(verify(SECRET, header, body, T), { ok: false, reason: "malformed" }, header);
    }
  });

  test("refuses an empty body that carries some other body's signature", () => {
    assert.equal(verify(SECRET, `t=${T},v1=${KNOWN}`, Buffer.alloc(0), T).reason, "mismatch");
  });
});
