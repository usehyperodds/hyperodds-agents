import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { tools as catalog } from "@hyperodds/client";
import { asSchema, generateText, stepCountIs } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { fairLine, server } from "../../client/test/server.js";
import { Hyperodds, hyperoddsTools, instructions } from "../dist/index.js";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
const turn = (content, unified) => ({
  content,
  finishReason: { unified, raw: unified },
  usage,
  warnings: [],
});
const callTool = (toolName, input) =>
  turn([{ type: "tool-call", toolCallId: "call-1", toolName, input: JSON.stringify(input) }], "tool-calls");
const say = (text) => turn([{ type: "text", text }], "stop");

describe("hyperoddsTools", () => {
  test("gives the four read-only tools with the catalog's descriptions and schemas", async () => {
    const tools = hyperoddsTools();
    assert.deepEqual(Object.keys(tools).sort(), Object.keys(catalog).sort());
    for (const [name, t] of Object.entries(tools)) {
      assert.equal(t.description, catalog[name].description);
      const schema = await asSchema(t.inputSchema).jsonSchema;
      assert.equal(schema.type, "object");
      assert.equal(schema.additionalProperties, false);
    }
    const fair = await asSchema(tools.odds_fair.inputSchema).jsonSchema;
    assert.deepEqual(fair.required, ["outcome"]);
  });

  test("execute calls the hosted tool and passes the abort signal on", async () => {
    const mcp = server();
    const tools = hyperoddsTools({ fetch: mcp.fetch });
    const out = await tools.odds_markets.execute(
      { sort: "edge", limit: 3 },
      { toolCallId: "1", messages: [] },
    );
    assert.equal(out.markets[0].outcome, 25457);
    assert.deepEqual(mcp.calls(), [{ name: "odds_markets", arguments: { sort: "edge", limit: 3 } }]);

    const controller = new AbortController();
    controller.abort(new Error("stopped"));
    await assert.rejects(
      tools.odds_fair.execute(
        { outcome: 1 },
        { toolCallId: "2", messages: [], abortSignal: controller.signal },
      ),
      /stopped/,
    );
  });

  test("a shared client is used as given", async () => {
    const mcp = server();
    const client = new Hyperodds({ fetch: mcp.fetch });
    await hyperoddsTools({ client }).odds_new.execute({}, { toolCallId: "1", messages: [] });
    await hyperoddsTools({ client }).odds_new.execute({}, { toolCallId: "2", messages: [] });
    assert.equal(mcp.sent.filter((s) => s.body.method === "initialize").length, 1);
  });
});

describe("in generateText", () => {
  test("the model's call reaches Hyperodds and the result comes back to the model", async () => {
    const mcp = server();
    const model = new MockLanguageModelV4({
      doGenerate: [callTool("odds_fair", { outcome: 25457 }), say("The line is 47%.")],
    });
    const result = await generateText({
      model,
      system: instructions,
      tools: hyperoddsTools({ fetch: mcp.fetch }),
      stopWhen: stepCountIs(3),
      prompt: "What is the fair line on market 25457?",
    });
    assert.equal(result.text, "The line is 47%.");
    assert.deepEqual(mcp.calls(), [{ name: "odds_fair", arguments: { outcome: 25457 } }]);
    const sent = model.doGenerateCalls[0].tools.map((t) => t.name).sort();
    assert.deepEqual(sent, ["odds_cluster", "odds_fair", "odds_markets", "odds_new"]);
    const reply = model.doGenerateCalls[1].prompt.at(-1).content[0];
    assert.equal(reply.type, "tool-result");
    assert.deepEqual(reply.output, { type: "json", value: fairLine });
  });

  test("a refused call reaches the model with the server's reason", async () => {
    const mcp = server({
      odds_fair: () => ({ isError: true, content: [{ type: "text", text: "No market with outcome id 7." }] }),
    });
    const model = new MockLanguageModelV4({
      doGenerate: [callTool("odds_fair", { outcome: 7 }), say("That market does not exist.")],
    });
    const result = await generateText({
      model,
      tools: hyperoddsTools({ fetch: mcp.fetch }),
      stopWhen: stepCountIs(3),
      prompt: "Fair line on 7?",
    });
    const reply = model.doGenerateCalls[1].prompt.at(-1).content[0];
    assert.equal(reply.output.type, "error-text");
    assert.match(reply.output.value, /No market with outcome id 7\./);
    assert.equal(result.text, "That market does not exist.");
  });

  test("input the schema rejects never reaches Hyperodds", async () => {
    const mcp = server();
    const model = new MockLanguageModelV4({
      doGenerate: [callTool("odds_markets", { limit: 500 }), say("Done.")],
    });
    await generateText({
      model,
      tools: hyperoddsTools({ fetch: mcp.fetch }),
      stopWhen: stepCountIs(3),
      prompt: "Every market",
    });
    assert.deepEqual(mcp.calls(), []);
  });
});
