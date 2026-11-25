// Stand-ins for a model, for running the examples without an API key. Each one makes the single
// tool call a model would make for "biggest edge after fees", then reads the tool's real result
// back. They show that the tools run inside each framework's loop; they are not models.
import type { MarketList } from "@hyperodds/client";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { type Model, type ModelRequest, Usage } from "@openai/agents";
import { MockLanguageModelV4 } from "ai/test";

export const NOTICE =
  "No OPENAI_API_KEY is set, so a scripted stand-in makes the tool call and reads the result back. It is not a model.";

const CALL = { name: "odds_markets", args: { sort: "edge", limit: 3 } } as const;

function answer(list: MarketList): string {
  const top = list.markets.find((m) => m.edgePts !== null && m.edgeSide !== null);
  if (!top || top.edgePts === null || top.edgeSide === null)
    return `None of the ${list.total} open markets shows an edge after fees right now.`;
  return `The largest edge after fees is on "${top.title}": ${top.edgePts.toFixed(1)} points buying ${top.sides[top.edgeSide]}, with a fair line of ${top.fair?.toFixed(3)} (confidence ${top.fairConfidence}). ${top.url}`;
}

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

export function scriptedAiSdk() {
  return new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      const last = prompt.at(-1);
      const result = last?.role === "tool" ? last.content.find((c) => c.type === "tool-result") : undefined;
      if (result?.type === "tool-result" && result.output.type === "json")
        return {
          content: [{ type: "text", text: answer(result.output.value as unknown as MarketList) }],
          finishReason: { unified: "stop", raw: "stop" },
          usage,
          warnings: [],
        };
      return {
        content: [
          { type: "tool-call", toolCallId: "call-1", toolName: CALL.name, input: JSON.stringify(CALL.args) },
        ],
        finishReason: { unified: "tool-calls", raw: "tool-calls" },
        usage,
        warnings: [],
      };
    },
  });
}

export function scriptedLangChain() {
  return fakeModel()
    .respondWithTools([{ ...CALL, id: "call-1" }])
    .respond(
      (messages: BaseMessage[]) => new AIMessage(answer(JSON.parse(String(messages.at(-1)?.content)))),
    );
}

export function scriptedAgents(): Model {
  return {
    async getResponse(request: ModelRequest) {
      const items = Array.isArray(request.input) ? request.input : [];
      const result = items.find((i) => i.type === "function_call_result");
      const text =
        result?.type === "function_call_result" &&
        typeof result.output === "object" &&
        "text" in result.output
          ? answer(JSON.parse(String(result.output.text)))
          : null;
      return {
        usage: new Usage(),
        output:
          text === null
            ? [
                {
                  type: "function_call",
                  callId: "call-1",
                  name: CALL.name,
                  // A strict model sends every property, with null for the ones it leaves out.
                  arguments: JSON.stringify({
                    category: null,
                    deployer: null,
                    q: null,
                    minEdgePts: null,
                    offset: null,
                    ...CALL.args,
                  }),
                  status: "completed",
                },
              ]
            : [
                {
                  type: "message",
                  role: "assistant",
                  status: "completed",
                  content: [{ type: "output_text", text }],
                },
              ],
      };
    },
    // biome-ignore lint/correctness/useYield: the examples never stream
    async *getStreamedResponse() {
      throw new Error("The scripted stand-in does not stream.");
    },
  };
}
