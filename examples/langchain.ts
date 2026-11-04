// Ask a model about HIP-4 markets with a LangChain agent.
// OPENAI_API_KEY=sk-... node examples/langchain.ts "Is the next Fed decision priced the same on every deployer?"
import { hyperoddsTools, instructions } from "@hyperodds/langchain";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, createAgent } from "langchain";

if (!process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY to your OpenAI API key. OPENAI_MODEL picks the model.");
  process.exit(1);
}

const question =
  process.argv.slice(2).join(" ") || "Which HIP-4 markets show the biggest edge after fees right now?";

const agent = createAgent({
  model: new ChatOpenAI({ model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini" }),
  tools: hyperoddsTools(),
  systemPrompt: instructions,
});

const { messages } = await agent.invoke({ messages: [{ role: "user", content: question }] });

for (const call of messages.flatMap((m) => (AIMessage.isInstance(m) ? (m.tool_calls ?? []) : []))) {
  console.log(`> ${call.name} ${JSON.stringify(call.args)}`);
}
console.log(`\n${messages.at(-1)?.text}`);
