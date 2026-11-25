import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { tools as catalog } from "@hyperodds/client";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { createAgent } from "langchain";
import { fairLine, server } from "../../client/test/server.js";
import { hyperoddsTools, instructions } from "../dist/index.js";

describe("hyperoddsTools", () => {
  test("gives the read-only tools with the catalog's names, descriptions and schemas", () => {
    const tools = hyperoddsTools();
    assert.deepEqual(
      tools.map((t) => t.name),
      Object.keys(catalog),
    );
    for (const t of tools) {
      assert.equal(t.description, catalog[t.name].description);
      assert.equal(toJsonSchema(t.schema).type, "object");
    }
  });

  test("a tool call becomes a tool message with the result as JSON", async () => {
    const mcp = server();
    const fair = hyperoddsTools({ fetch: mcp.fetch }).find((t) => t.name === "odds_fair");
    const message = await fair.invoke({
      id: "call-1",
      name: "odds_fair",
      args: { outcome: 25457 },
      type: "tool_call",
    });
    assert.equal(message.tool_call_id, "call-1");
    assert.deepEqual(JSON.parse(message.content), fairLine);
    assert.deepEqual(await fair.invoke({ outcome: 25457 }), fairLine);
  });

  test("input the schema rejects never reaches Hyperodds", async () => {
    const mcp = server();
    const markets = hyperoddsTools({ fetch: mcp.fetch }).find((t) => t.name === "odds_markets");
    await assert.rejects(markets.invoke({ limit: 500 }));
    assert.deepEqual(mcp.calls(), []);
  });
});

describe("in createAgent", () => {
  test("the agent calls Hyperodds and answers from the result", async () => {
    const mcp = server();
    const model = fakeModel()
      .respondWithTools([{ name: "odds_markets", args: { sort: "edge", limit: 5 }, id: "call-1" }])
      .respond(new AIMessage("BTC above 80,500 has the largest edge."));
    const agent = createAgent({
      model,
      tools: hyperoddsTools({ fetch: mcp.fetch }),
      systemPrompt: instructions,
    });
    const { messages } = await agent.invoke({ messages: [new HumanMessage("Where is the edge?")] });
    assert.deepEqual(mcp.calls(), [{ name: "odds_markets", arguments: { sort: "edge", limit: 5 } }]);
    const toolMessage = messages.find((m) => m.type === "tool");
    assert.equal(JSON.parse(toolMessage.content).markets[0].outcome, 25457);
    assert.equal(messages.at(-1).content, "BTC above 80,500 has the largest edge.");
  });

  test("the agent searches by words and reads the market it finds", async () => {
    const mcp = server();
    const model = fakeModel()
      .respondWithTools([{ name: "search", args: { query: "bitcoin 80,500" }, id: "call-1" }])
      .respondWithTools([{ name: "fetch", args: { id: "25457" }, id: "call-2" }])
      .respond(new AIMessage("Yes is 41¢ bid, 44¢ ask."));
    const agent = createAgent({ model, tools: hyperoddsTools({ fetch: mcp.fetch }) });
    const { messages } = await agent.invoke({ messages: [new HumanMessage("Bitcoin above 80,500?")] });
    assert.deepEqual(
      mcp.calls().map((c) => c.name),
      ["search", "fetch"],
    );
    const read = messages.filter((m) => m.type === "tool").at(-1);
    assert.equal(JSON.parse(read.content).metadata.outcome, 25457);
    assert.equal(messages.at(-1).content, "Yes is 41¢ bid, 44¢ ask.");
  });

  test("a refused call reaches the model with the server's reason", async () => {
    const mcp = server({
      odds_fair: () => ({ isError: true, content: [{ type: "text", text: "No market with outcome id 7." }] }),
    });
    const model = fakeModel()
      .respondWithTools([{ name: "odds_fair", args: { outcome: 7 }, id: "call-1" }])
      .respond(new AIMessage("That market does not exist."));
    const agent = createAgent({ model, tools: hyperoddsTools({ fetch: mcp.fetch }) });
    const { messages } = await agent.invoke({ messages: [new HumanMessage("Fair line on 7?")] });
    const toolMessage = messages.find((m) => m.type === "tool");
    assert.equal(toolMessage.status, "error");
    assert.match(toolMessage.content, /No market with outcome id 7\./);
  });
});
