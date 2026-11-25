// Ask a model about HIP-4 markets with Vercel's AI SDK.
// OPENAI_API_KEY=sk-... node examples/ai-sdk.ts "Which HIP-4 markets show the biggest edge right now?"
// Without a key, a scripted stand-in runs the same loop against the live tools.
import { openai } from "@ai-sdk/openai";
import { hyperoddsTools, instructions } from "@hyperodds/ai-sdk";
import { generateText, stepCountIs } from "ai";
import { NOTICE, scriptedAiSdk } from "./scripted.ts";

const keyed = Boolean(process.env.OPENAI_API_KEY);
if (!keyed) console.error(NOTICE);

const question =
  process.argv.slice(2).join(" ") || "Which HIP-4 markets show the biggest edge after fees right now?";

const { text, steps } = await generateText({
  model: keyed ? openai(process.env.OPENAI_MODEL ?? "gpt-5.4-mini") : scriptedAiSdk(),
  system: instructions,
  tools: hyperoddsTools(),
  stopWhen: stepCountIs(8),
  prompt: question,
});

for (const call of steps.flatMap((step) => step.toolCalls)) {
  console.log(`> ${call.toolName} ${JSON.stringify(call.input)}`);
}
console.log(`\n${text}`);
