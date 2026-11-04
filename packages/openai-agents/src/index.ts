import { Hyperodds, type HyperoddsOptions, runTool, type ToolName, tools } from "@hyperodds/client";
import { type FunctionTool, tool } from "@openai/agents";

export { Hyperodds, HyperoddsError, type HyperoddsOptions, instructions } from "@hyperodds/client";

export interface HyperoddsToolsOptions extends HyperoddsOptions {
  /** A client to share between tool sets; the other options are ignored when it is given. */
  client?: Hyperodds;
}

export type HyperoddsTool = FunctionTool<unknown, (typeof tools)[ToolName]["input"]> & { name: ToolName };

/**
 * The read-only Hyperodds tools for the OpenAI Agents SDK, as strict function tools:
 * `new Agent({ tools: hyperoddsTools() })`. When Hyperodds refuses a call, the model reads the
 * reason, such as an unknown outcome id or the daily allowance.
 */
export function hyperoddsTools(options: HyperoddsToolsOptions = {}): HyperoddsTool[] {
  const client = options.client ?? new Hyperodds(options);
  return (Object.keys(tools) as ToolName[]).map(
    (name) =>
      tool({
        name,
        description: tools[name].description,
        parameters: tools[name].input,
        execute: (input, _context, details) => runTool(client, name, input, { signal: details?.signal }),
        errorFunction: (_context, error) => (error instanceof Error ? error.message : String(error)),
      }) as HyperoddsTool,
  );
}
