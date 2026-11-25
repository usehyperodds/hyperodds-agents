import { createHmac, timingSafeEqual } from "node:crypto";

/** A signature older or newer than this, against our clock, is refused, which bounds replays. */
export const TOLERANCE_S = 300;

export type Verdict =
  | { ok: true; timestamp: number }
  | { ok: false; reason: "missing" | "malformed" | "mismatch" | "expired" };

/**
 * Checks a `hyperodds-signature` header, `t=<unix seconds>,v1=<hex>[,v1=<hex>…]`, against the raw
 * request body. v1 is HMAC-SHA256 keyed with the signing secret exactly as the console shows it,
 * over `${t}.${body}`. Any one v1 entry may match.
 */
export function verify(
  secret: string,
  header: string | undefined,
  body: Buffer,
  nowS = Math.floor(Date.now() / 1000),
): Verdict {
  if (!header) return { ok: false, reason: "missing" };

  let timestamp: number | null = null;
  const signatures: Buffer[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t" && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    else if (key === "v1" && /^[0-9a-f]{64}$/i.test(value)) signatures.push(Buffer.from(value, "hex"));
  }
  if (timestamp === null || signatures.length === 0) return { ok: false, reason: "malformed" };

  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest();
  if (!signatures.some((s) => timingSafeEqual(s, expected))) return { ok: false, reason: "mismatch" };
  if (Math.abs(nowS - timestamp) > TOLERANCE_S) return { ok: false, reason: "expired" };
  return { ok: true, timestamp };
}
