// Ask a model about HIP-4 markets with the OpenAI Agents SDK.
// OPENAI_API_KEY=sk-... node examples/openai-agents.ts "What was listed in the last hour?"
// Without a key, a scripted stand-in runs the same loop against the live tools.
import { hyperoddsTools, instructions } from "@hyperodds/openai-agents";
import { Agent, run, setTracingDisabled } from "@openai/agents";
import { NOTICE, scriptedAgents } from "./scripted.ts";

const keyed = Boolean(process.env.OPENAI_API_KEY);
if (!keyed) {
  console.error(NOTICE);
  // Traces go to OpenAI and need its key.
  setTracingDisabled(true);
}

const question =
  process.argv.slice(2).join(" ") || "Which HIP-4 markets show the biggest edge after fees right now?";

const agent = new Agent({
  name: "HIP-4 analyst",
  instructions,
  model: keyed ? (process.env.OPENAI_MODEL ?? "gpt-5.4-mini") : scriptedAgents(),
  tools: hyperoddsTools(),
});

const result = await run(agent, question);

for (const item of result.newItems) {
  if (item.type === "tool_call_item" && item.rawItem.type === "function_call") {
    console.log(`> ${item.rawItem.name} ${item.rawItem.arguments}`);
  }
}
console.log(`\n${result.finalOutput}`);
