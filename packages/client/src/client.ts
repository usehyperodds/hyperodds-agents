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
  ) {
    super(message);
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
  error?: { code?: unknown; message?: unknown };
}

/**
 * Reads the hosted Hyperodds MCP server over Streamable HTTP. The server keeps no session: the
 * client negotiates the protocol version once, then sends each tool call as one POST.
 */
export class Hyperodds {
  readonly url: string;
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
    this.url = url;
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
    const { result } = await this.request("tools/call", { name, arguments: args }, options.signal, protocol);
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

  private async request(
    method: string,
    params: object,
    signal?: AbortSignal,
    protocol?: string,
  ): Promise<RpcResponse> {
    const id = this.nextId++;
    const { status, answer } = await this.exchange({ jsonrpc: "2.0", id, method, params }, signal, protocol);
    if (answer?.error) {
      const message = typeof answer.error.message === "string" ? answer.error.message : "no reason given";
      const code = typeof answer.error.code === "number" ? answer.error.code : status;
      throw new HyperoddsError(`Hyperodds refused the request: ${message}`, code);
    }
    if (!answer?.result) throw new HyperoddsError(`Hyperodds replied HTTP ${status} with no answer.`, status);
    return answer;
  }

  /** One POST and its answer: the JSON body, or the first event that answers `message`. */
  private async exchange(
    message: { jsonrpc: "2.0"; id?: number; method: string; params?: object },
    signal?: AbortSignal,
    protocol?: string,
  ): Promise<{ status: number; answer?: RpcResponse }> {
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
      if (message.id !== undefined && type.includes("application/json"))
        return { status: res.status, answer: (await res.json()) as RpcResponse };
      if (message.id !== undefined && type.includes("text/event-stream") && res.body) {
        for await (const data of events(res.body)) {
          const answer = JSON.parse(data) as RpcResponse;
          // A refusal made before the server read the message (a rate limit, say) has no id.
          if (answer.id === message.id || (answer.id === null && answer.error))
            return { status: res.status, answer };
        }
      }
      await res.body?.cancel();
      return { status: res.status };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (timeout.aborted)
        throw new HyperoddsError(`Hyperodds did not answer within ${this.timeoutMs / 1000} seconds.`);
      if (error instanceof SyntaxError)
        throw new HyperoddsError("Hyperodds sent an answer that is not JSON.");
      const code = (error as { cause?: { code?: unknown } }).cause?.code;
      const detail = typeof code === "string" ? code : error instanceof Error ? error.message : String(error);
      throw new HyperoddsError(`Could not reach Hyperodds at ${this.url} (${detail}).`);
    }
  }
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
