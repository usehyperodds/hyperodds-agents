import { tools } from "./tools.js";
import type {
  Cluster,
  ClusterInput,
  FairInput,
  FairLine,
  MarketList,
  MarketsInput,
  NewInput,
} from "./types.js";
import { version } from "./version.js";

export const DEFAULT_URL = "https://api.usehyperodds.com/mcp";
const PROTOCOL_VERSION = "2025-06-18";
// The longest delay a timer takes; a longer one fires at once.
const MAX_TIMEOUT_MS = 2_147_483_647;
// A rate limit or a restart that asks for a longer wait will not clear within one retry.
const MAX_RETRY_WAIT_MS = 5_000;
const RETRY_PAUSE_MS = 250;

export interface HyperoddsOptions {
  /** The MCP endpoint. Defaults to the hosted server. */
  url?: string;
  /** How long to wait for each answer, in whole milliseconds up to 2,147,483,647. Defaults to 30 seconds. */
  timeoutMs?: number;
  /** Goes ahead of the client's own user agent, so you can tell your traffic apart. */
  userAgent?: string;
  fetch?: typeof fetch;
}

export interface CallOptions {
  signal?: AbortSignal;
}

export class HyperoddsError extends Error {
  override readonly name = "HyperoddsError";

  constructor(
    message: string,
    /** The JSON-RPC error code, or the HTTP status when the server sent no JSON-RPC answer. */
    readonly code?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export interface HostedTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: { type: "object"; properties?: Record<string, object>; required?: string[] };
  outputSchema?: object;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; [hint: string]: unknown };
}

interface RpcResponse {
  id?: unknown;
  result?: {
    protocolVersion?: unknown;
    isError?: unknown;
    structuredContent?: unknown;
    content?: { type?: unknown; text?: unknown }[];
  };
  error?: unknown;
}

/**
 * Reads the hosted Hyperodds MCP server over Streamable HTTP. The server keeps no session: the
 * client negotiates the protocol version once, then sends each tool call as one POST.
 */
export class Hyperodds {
  readonly url: string;
  // Origin and path only: a token in the query string must not reach a model or a log.
  private readonly where: string;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly fetch: typeof fetch;
  private ready: Promise<string> | null = null;
  private nextId = 1;

  constructor(options: HyperoddsOptions = {}) {
    const { url = DEFAULT_URL, timeoutMs = 30_000 } = options;
    if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol))
      throw new TypeError("url must be an absolute http or https URL.");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS)
      throw new RangeError(`timeoutMs must be a whole number of milliseconds from 1 to ${MAX_TIMEOUT_MS}.`);
    const { origin, pathname } = new URL(url);
    this.url = url;
    this.where = origin + pathname;
    this.timeoutMs = timeoutMs;
    this.userAgent = [options.userAgent, `hyperodds-client/${version}`].filter(Boolean).join(" ");
    // Unbound, since Workers and browsers refuse a fetch called as a method of another object.
    this.fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  /** Markets from every deployer, with top of book, fair line and edge after fees. */
  markets(input: MarketsInput = {}, options?: CallOptions): Promise<MarketList> {
    return this.call("odds_markets", input, options) as Promise<MarketList>;
  }

  /** Markets in listing order, newest first. */
  newest(input: NewInput = {}, options?: CallOptions): Promise<MarketList> {
    return this.call("odds_new", input, options) as Promise<MarketList>;
  }

  /** One market's fair line with its sources, book and edges. */
  fair(input: FairInput, options?: CallOptions): Promise<FairLine> {
    return this.call("odds_fair", input, options) as Promise<FairLine>;
  }

  /** One question across deployers, with rule grades and the merged book. */
  cluster(input: ClusterInput, options?: CallOptions): Promise<Cluster> {
    return this.call("odds_cluster", input, options) as Promise<Cluster>;
  }

  /** The tools the server offers, as it describes them to MCP clients. */
  async listTools(options: CallOptions = {}): Promise<HostedTool[]> {
    const protocol = await this.initialize();
    const { result } = await this.request("tools/list", {}, options.signal, protocol);
    return (result as { tools?: HostedTool[] }).tools ?? [];
  }

  /** Calls a tool by name and returns its structured result. */
  async call(name: string, args: object, options: CallOptions = {}): Promise<unknown> {
    const protocol = await this.initialize();
    // Only the catalog's tools are known to be read-only, so only they are sent twice.
    const retry = Object.hasOwn(tools, name);
    const { result } = await this.request(
      "tools/call",
      { name, arguments: args },
      options.signal,
      protocol,
      retry,
    );
    const text = result?.content?.find((c) => c.type === "text")?.text;
    if (result?.isError === true)
      throw new HyperoddsError(typeof text === "string" ? text : `Hyperodds could not run ${name}.`);
    if (result?.structuredContent !== undefined) return result.structuredContent;
    try {
      return JSON.parse(String(text));
    } catch {
      throw new HyperoddsError(`Hyperodds answered ${name} without a JSON result.`);
    }
  }

  // Shared by every call in flight, so no one caller's signal may cancel it; the timeout bounds it.
  private initialize(): Promise<string> {
    this.ready ??= this.handshake().catch((error: unknown) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }

  private async handshake(): Promise<string> {
    const { result } = await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "hyperodds-client", version },
    });
    const protocol = typeof result?.protocolVersion === "string" ? result.protocolVersion : PROTOCOL_VERSION;
    await this.exchange({ jsonrpc: "2.0", method: "notifications/initialized" }, undefined, protocol);
    return protocol;
  }

  /** With `retry`, a dropped connection, a bad gateway or a short wait the server asks for gets one more try. */
  private async request(
    method: string,
    params: object,
    signal?: AbortSignal,
    protocol?: string,
    retry = true,
  ): Promise<RpcResponse> {
    const id = this.nextId++;
    let reply: Awaited<ReturnType<Hyperodds["exchange"]>>;
    try {
      reply = await this.exchange({ jsonrpc: "2.0", id, method, params }, signal, protocol);
    } catch (error) {
      if (!retry || networkCode((error as Error).cause) !== "ECONNRESET") throw error;
      await pause(RETRY_PAUSE_MS, signal);
      return this.request(method, params, signal, protocol, false);
    }
    const { status, answer, retryAfter } = reply;
    const wait = retry ? retryDelay(status, retryAfter) : null;
    if (wait !== null) {
      await pause(wait, signal);
      return this.request(method, params, signal, protocol, false);
    }
    const error = answer?.error;
    if (typeof error === "string")
      throw new HyperoddsError(`Hyperodds replied HTTP ${status}: ${error.slice(0, 200)}`, status);
    if (error) {
      const { message, code } = error as { message?: unknown; code?: unknown };
      const reason = typeof message === "string" ? message : "no reason given";
      throw new HyperoddsError(
        `Hyperodds refused the request: ${reason}`,
        typeof code === "number" ? code : status,
      );
    }
    if (!answer?.result) throw new HyperoddsError(`Hyperodds replied HTTP ${status} with no answer.`, status);
    return answer;
  }

  /** One POST and its answer: the JSON body, or the first event that answers `message`. */
  private async exchange(
    message: { jsonrpc: "2.0"; id?: number; method: string; params?: object },
    signal?: AbortSignal,
    protocol?: string,
  ): Promise<{ status: number; answer?: RpcResponse; retryAfter: string | null }> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    try {
      const res = await this.fetch(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "user-agent": this.userAgent,
          ...(protocol ? { "mcp-protocol-version": protocol } : {}),
        },
        body: JSON.stringify(message),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      const type = res.headers.get("content-type") ?? "";
      const { status } = res;
      const retryAfter = res.headers.get("retry-after");
      if (message.id !== undefined && type.includes("application/json"))
        return { status, retryAfter, answer: (await res.json()) as RpcResponse };
      if (message.id !== undefined && type.includes("text/event-stream") && res.body) {
        for await (const data of events(res.body)) {
          const answer = JSON.parse(data) as RpcResponse;
          // A refusal made before the server read the message (a rate limit, say) has no id.
          if (answer.id === message.id || (answer.id === null && answer.error))
            return { status, retryAfter, answer };
        }
      }
      await res.body?.cancel();
      return { status, retryAfter };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (timeout.aborted)
        throw new HyperoddsError(
          `Hyperodds did not answer within ${this.timeoutMs / 1000} seconds.`,
          undefined,
          {
            cause: error,
          },
        );
      if (error instanceof SyntaxError)
        throw new HyperoddsError("Hyperodds sent an answer that is not JSON.", undefined, { cause: error });
      const code = networkCode(error);
      const detail = code ?? (error instanceof Error ? error.message : String(error));
      throw new HyperoddsError(`Could not reach Hyperodds at ${this.where} (${detail}).`, undefined, {
        cause: error,
      });
    }
  }
}

/** How long to wait before the one retry, or null when the answer stands. */
function retryDelay(status: number, retryAfter: string | null): number | null {
  if (status === 502) return RETRY_PAUSE_MS;
  if ((status !== 429 && status !== 503) || !retryAfter) return null;
  const ms = /^\s*\d+\s*$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
  return ms <= MAX_RETRY_WAIT_MS ? Math.max(0, ms) : null;
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const stop = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    signal?.addEventListener("abort", stop, { once: true });
  });
}

/** The system error code under a failed fetch, such as ECONNRESET, if there is one. */
function networkCode(error: unknown): string | undefined {
  const cause = (error as { cause?: { code?: unknown; errors?: { code?: unknown }[] } })?.cause;
  const code = cause?.code ?? cause?.errors?.[0]?.code;
  return typeof code === "string" ? code : undefined;
}

async function* events(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    // A CR at the end of a chunk may be half of a CRLF; wait for the next chunk to tell.
    const held = buffer.endsWith("\r") ? "\r" : "";
    const blocks = (held ? buffer.slice(0, -1) : buffer).replace(/\r\n?/g, "\n").split("\n\n");
    buffer = blocks.pop()! + held;
    for (const block of blocks) {
      const data = block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data) yield data;
    }
  }
}
