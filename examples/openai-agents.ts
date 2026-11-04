// Ask a model about HIP-4 markets with the OpenAI Agents SDK.
// OPENAI_API_KEY=sk-... node examples/openai-agents.ts "What was listed in the last hour?"
import { hyperoddsTools, instructions } from "@hyperodds/openai-agents";
import { Agent, run } from "@openai/agents";

if (!process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY to your OpenAI API key. OPENAI_MODEL picks the model.");
  process.exit(1);
}

const question =
  process.argv.slice(2).join(" ") || "Which HIP-4 markets show the biggest edge after fees right now?";

const agent = new Agent({
  name: "HIP-4 analyst",
  instructions,
  model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
  tools: hyperoddsTools(),
});

const result = await run(agent, question);

for (const item of result.newItems) {
  if (item.type === "tool_call_item" && item.rawItem.type === "function_call") {
    console.log(`> ${item.rawItem.name} ${item.rawItem.arguments}`);
  }
}
console.log(`\n${result.finalOutput}`);
