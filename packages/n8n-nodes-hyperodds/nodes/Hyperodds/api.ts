import type {
  IDataObject,
  IExecuteFunctions,
  ILoadOptionsFunctions,
  IN8nHttpFullResponse,
  JsonObject,
} from "n8n-workflow";
import { NodeApiError, sleep } from "n8n-workflow";
import { version } from "../../package.json";

export const API_URL = "https://api.usehyperodds.com";

const USER_AGENT = `n8n-nodes-hyperodds/${version} (+https://github.com/usehyperodds/hyperodds-agents)`;
const ATTEMPTS = 3;
// Longer waits than this mean a spent budget, which a retry inside one execution cannot fix.
const MAX_WAIT_S = 10;

interface TrpcAnswer {
  result?: { data?: unknown };
  error?: { message?: unknown; data?: { code?: unknown; httpStatus?: unknown } };
}

/**
 * Calls a public tRPC query. Retries a rate limit or a server that is still loading its markets
 * after the wait it asks for, and turns every other failure into a NodeApiError with the server's
 * own message.
 */
export async function query<T>(
  ctx: IExecuteFunctions | ILoadOptionsFunctions,
  procedure: string,
  input?: IDataObject,
  itemIndex = 0,
  /** What a 404 means for this call, naming the parameter to check. */
  notFound?: string,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    let response: IN8nHttpFullResponse;
    try {
      response = (await ctx.helpers.httpRequest({
        method: "GET",
        url: `${API_URL}/trpc/${procedure}`,
        qs: input ? { input: JSON.stringify(input) } : undefined,
        headers: { accept: "application/json", "user-agent": USER_AGENT },
        json: true,
        returnFullResponse: true,
        ignoreHttpStatusErrors: true,
        timeout: 30_000,
      })) as IN8nHttpFullResponse;
    } catch (error) {
      throw new NodeApiError(ctx.getNode(), error as JsonObject, {
        itemIndex,
        message: "Could not reach Hyperodds",
        description: `The request to ${API_URL} failed before an answer came back.`,
      });
    }

    const { statusCode } = response;
    const answer = parse(response.body);
    if (statusCode >= 200 && statusCode < 300 && answer?.result && "data" in answer.result) {
      return answer.result.data as T;
    }

    const wait = retryWait(statusCode, response.headers["retry-after"]);
    if (wait !== null && attempt < ATTEMPTS) {
      await sleep(wait * 1000);
      continue;
    }

    const message =
      typeof answer?.error?.message === "string"
        ? answer.error.message
        : `Hyperodds answered HTTP ${statusCode} to ${procedure}`;
    throw new NodeApiError(ctx.getNode(), (answer ?? { statusCode }) as JsonObject, {
      itemIndex,
      httpCode: String(statusCode),
      message,
      description: statusCode === 404 && notFound ? notFound : describe(statusCode),
    });
  }
}

function parse(body: unknown): TrpcAnswer | null {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as TrpcAnswer;
    } catch {
      return null;
    }
  }
  return body !== null && typeof body === "object" ? (body as TrpcAnswer) : null;
}

function retryWait(status: number, header: unknown): number | null {
  if (status !== 429 && status !== 503) return null;
  const seconds = Number(Array.isArray(header) ? header[0] : header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds <= MAX_WAIT_S ? seconds : null;
  return status === 503 ? 2 : 1;
}

function describe(status: number): string | undefined {
  if (status === 429)
    return "The public API allows 30 requests a second per address, in bursts of up to 120. Space out the calls, or lower the number of input items.";
  if (status === 503) return "Hyperodds is starting up or briefly unavailable. Try again in a minute.";
  return undefined;
}
