import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { tools as catalog } from "@hyperodds/client";
import { Agent, RunContext, run, setTracingDisabled, Usage } from "@openai/agents";
import { fairLine, server } from "../../client/test/server.js";
import { hyperoddsTools, instructions } from "../dist/index.js";

setTracingDisabled(true);

/** A model that plays back a script, one turn per request, and keeps what it was sent. */
function scripted(...turns) {
  const requests = [];
  return {
    requests,
    async getResponse(request) {
      requests.push(request);
      return { usage: new Usage(), output: turns[requests.length - 1] };
    },
    // biome-ignore lint/correctness/useYield: the runner here never streams
    async *getStreamedResponse() {
      throw new Error("not streamed");
    },
  };
}
const callTool = (name, args) => [
  { type: "function_call", callId: "call-1", name, arguments: JSON.stringify(args), status: "completed" },
];
const say = (text) => [
  { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text }] },
];

describe("hyperoddsTools", () => {
  test("gives the four read-only tools as strict function tools", () => {
    const tools = hyperoddsTools();
    assert.deepEqual(
      tools.map((t) => t.name),
      Object.keys(catalog),
    );
    for (const t of tools) {
      assert.equal(t.type, "function");
      assert.equal(t.strict, true);
      assert.equal(t.description, catalog[t.name].description);
      assert.deepEqual(t.parameters.required.sort(), Object.keys(t.parameters.properties).sort());
    }
  });

  test("nulls a strict model sends for optional inputs are left out of the call", async () => {
    const mcp = server();
    const markets = hyperoddsTools({ fetch: mcp.fetch }).find((t) => t.name === "odds_markets");
    const args = { category: "crypto", deployer: null, sort: "edge", q: null, limit: 5, offset: null };
    const out = await markets.invoke(new RunContext(), JSON.stringify(args));
    assert.equal(out.markets[0].outcome, 25457);
    assert.deepEqual(mcp.calls(), [
      { name: "odds_markets", arguments: { category: "crypto", sort: "edge", limit: 5 } },
    ]);
  });

  test("a refused call gives the model the server's reason", async () => {
    const mcp = server({
      odds_fair: () => ({ isError: true, content: [{ type: "text", text: "No market with outcome id 7." }] }),
    });
    const fair = hyperoddsTools({ fetch: mcp.fetch }).find((t) => t.name === "odds_fair");
    assert.equal(await fair.invoke(new RunContext(), '{"outcome":7}'), "No market with outcome id 7.");
  });
});

describe("in a run", () => {
  test("the agent calls Hyperodds and answers from the result", async () => {
    const mcp = server();
    const model = scripted(callTool("odds_fair", { outcome: 25457 }), say("The line is 47%."));
    const agent = new Agent({
      name: "Odds",
      instructions,
      model,
      tools: hyperoddsTools({ fetch: mcp.fetch }),
    });
    const result = await run(agent, "What is the fair line on market 25457?");
    assert.equal(result.finalOutput, "The line is 47%.");
    assert.deepEqual(mcp.calls(), [{ name: "odds_fair", arguments: { outcome: 25457 } }]);
    assert.deepEqual(
      model.requests[0].tools.map((t) => t.name),
      Object.keys(catalog),
    );
    const output = model.requests[1].input.find((i) => i.type === "function_call_result");
    assert.equal(output.callId, "call-1");
    assert.deepEqual(JSON.parse(output.output.text), fairLine);
  });
});
