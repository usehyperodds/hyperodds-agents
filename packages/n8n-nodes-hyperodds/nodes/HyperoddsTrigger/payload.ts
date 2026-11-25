import type { IDataObject } from "n8n-workflow";

/** How many delivery IDs the trigger remembers to drop a retry it already passed on. */
export const RECENT_DELIVERIES = 200;

export interface Payload extends IDataObject {
  id: string;
  type: string;
}

/**
 * Reads a version 1 webhook body. Only `id` and `type` are required, so fields Hyperodds adds later
 * pass through untouched.
 */
export function parsePayload(body: Buffer): Payload | null {
  let value: unknown;
  try {
    value = JSON.parse(body.toString("utf8"));
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as IDataObject;
  if (typeof payload.id !== "string" || !payload.id) return null;
  if (typeof payload.type !== "string" || !payload.type) return null;
  return payload as Payload;
}

const isTest = (payload: Payload) => payload.test === true || payload.type === "test";

/** `events` holds `*` for every alert, or alert types; test messages have their own switch. */
export function wanted(payload: Payload, events: string[], includeTests: boolean): boolean {
  if (isTest(payload)) return includeTests;
  return events.includes("*") || events.includes(payload.type);
}

/** Records a delivery ID and reports whether it was new. Oldest IDs fall off first. */
export function firstDelivery(store: IDataObject, id: string): boolean {
  const seen = Array.isArray(store.deliveries) ? (store.deliveries as string[]) : [];
  if (seen.includes(id)) return false;
  store.deliveries = [...seen, id].slice(-RECENT_DELIVERIES);
  return true;
}
