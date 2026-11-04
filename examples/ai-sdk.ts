// Ask a model about HIP-4 markets with Vercel's AI SDK.
// OPENAI_API_KEY=sk-... node examples/ai-sdk.ts "Which HIP-4 markets show the biggest edge right now?"
import { openai } from "@ai-sdk/openai";
import { hyperoddsTools, instructions } from "@hyperodds/ai-sdk";
import { generateText, stepCountIs } from "ai";

if (!process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY to your OpenAI API key. OPENAI_MODEL picks the model.");
  process.exit(1);
}

const question =
  process.argv.slice(2).join(" ") || "Which HIP-4 markets show the biggest edge after fees right now?";

const { text, steps } = await generateText({
  model: openai(process.env.OPENAI_MODEL ?? "gpt-5.4-mini"),
  system: instructions,
  tools: hyperoddsTools(),
  stopWhen: stepCountIs(8),
  prompt: question,
});

for (const call of steps.flatMap((step) => step.toolCalls)) {
  console.log(`> ${call.toolName} ${JSON.stringify(call.input)}`);
}
console.log(`\n${text}`);
