import { Hyperodds, type HyperoddsOptions, runTool, type ToolName, tools } from "@hyperodds/client";
import { type DynamicStructuredTool, tool } from "@langchain/core/tools";

export { Hyperodds, HyperoddsError, type HyperoddsOptions, instructions } from "@hyperodds/client";

export interface HyperoddsToolsOptions extends HyperoddsOptions {
  /** A client to share between tool sets; the other options are ignored when it is given. */
  client?: Hyperodds;
}

export type HyperoddsTool = DynamicStructuredTool & { name: ToolName };

/**
 * The read-only Hyperodds tools for LangChain: pass them to `createAgent`, `model.bindTools` or a
 * LangGraph `ToolNode`. A tool message carries the result as JSON.
 */
export function hyperoddsTools(options: HyperoddsToolsOptions = {}): HyperoddsTool[] {
  const client = options.client ?? new Hyperodds(options);
  return (Object.keys(tools) as ToolName[]).map(
    (name) =>
      tool((input, config) => runTool(client, name, input, { signal: config?.signal }), {
        name,
        description: tools[name].description,
        schema: tools[name].input,
      }) as HyperoddsTool,
  );
}
