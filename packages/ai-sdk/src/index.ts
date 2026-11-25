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
  return {
    search: tool({
      description: tools.search.description,
      inputSchema: tools.search.input,
      execute: (input, { abortSignal }) => runTool(client, "search", input, { signal: abortSignal }),
    }),
    fetch: tool({
      description: tools.fetch.description,
      inputSchema: tools.fetch.input,
      execute: (input, { abortSignal }) => runTool(client, "fetch", input, { signal: abortSignal }),
    }),
    odds_markets: tool({
      description: tools.odds_markets.description,
      inputSchema: tools.odds_markets.input,
      execute: (input, { abortSignal }) => runTool(client, "odds_markets", input, { signal: abortSignal }),
    }),
    odds_new: tool({
      description: tools.odds_new.description,
      inputSchema: tools.odds_new.input,
      execute: (input, { abortSignal }) => runTool(client, "odds_new", input, { signal: abortSignal }),
    }),
    odds_fair: tool({
      description: tools.odds_fair.description,
      inputSchema: tools.odds_fair.input,
      execute: (input, { abortSignal }) => runTool(client, "odds_fair", input, { signal: abortSignal }),
    }),
    odds_cluster: tool({
      description: tools.odds_cluster.description,
      inputSchema: tools.odds_cluster.input,
      execute: (input, { abortSignal }) => runTool(client, "odds_cluster", input, { signal: abortSignal }),
    }),
    odds_leaderboard: tool({
      description: tools.odds_leaderboard.description,
      inputSchema: tools.odds_leaderboard.input,
      execute: (input, { abortSignal }) =>
        runTool(client, "odds_leaderboard", input, { signal: abortSignal }),
    }),
    odds_forecast_record: tool({
      description: tools.odds_forecast_record.description,
      inputSchema: tools.odds_forecast_record.input,
      execute: (input, { abortSignal }) =>
        runTool(client, "odds_forecast_record", input, { signal: abortSignal }),
    }),
  };
}
