import {
  Hyperodds,
  type HyperoddsOptions,
  runTool,
  type ToolInput,
  type ToolName,
  type ToolOutput,
  tools,
} from "@hyperodds/client";
import { type Tool, tool } from "ai";

export { Hyperodds, HyperoddsError, type HyperoddsOptions, instructions } from "@hyperodds/client";

export interface HyperoddsToolsOptions extends HyperoddsOptions {
  /** A client to share between tool sets; the other options are ignored when it is given. */
  client?: Hyperodds;
}

type Executable<T extends Tool> = T & { execute: NonNullable<T["execute"]> };
export type HyperoddsTools = { [K in ToolName]: Executable<Tool<ToolInput<K>, ToolOutput<K>>> };

/**
 * The read-only Hyperodds tools as an AI SDK tool set, for `generateText`, `streamText` or an
 * agent: `tools: hyperoddsTools()`.
 */
export function hyperoddsTools(options: HyperoddsToolsOptions = {}): HyperoddsTools {
  const client = options.client ?? new Hyperodds(options);
  const { odds_markets, odds_new, odds_fair, odds_cluster } = tools;
  return {
    odds_markets: tool({
      description: odds_markets.description,
      inputSchema: odds_markets.input,
      execute: (input, { abortSignal }) => runTool(client, "odds_markets", input, { signal: abortSignal }),
    }),
    odds_new: tool({
      description: odds_new.description,
      inputSchema: odds_new.input,
      execute: (input, { abortSignal }) => runTool(client, "odds_new", input, { signal: abortSignal }),
    }),
    odds_fair: tool({
      description: odds_fair.description,
      inputSchema: odds_fair.input,
      execute: (input, { abortSignal }) => runTool(client, "odds_fair", input, { signal: abortSignal }),
    }),
    odds_cluster: tool({
      description: odds_cluster.description,
      inputSchema: odds_cluster.input,
      execute: (input, { abortSignal }) => runTool(client, "odds_cluster", input, { signal: abortSignal }),
    }),
  };
}
