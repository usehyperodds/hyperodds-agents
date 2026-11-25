import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { tools } from "../dist/index.js";
import { hosted } from "./server.js";

// `npm run demo` checks the live tools/list the same way.

// odds_forecast records a forecast, which takes the forecaster's own signature: not in the catalog.
const readOnly = hosted.filter((t) => t.annotations.readOnlyHint);

test("the catalog has the hosted server's read-only tools, no more and no fewer", () => {
  assert.deepEqual(Object.keys(tools).sort(), readOnly.map((t) => t.name).sort());
  assert.deepEqual(
    hosted.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name),
    ["odds_forecast"],
  );
});

for (const remote of readOnly) {
  test(`${remote.name} takes the hosted server's inputs`, () => {
    const local = z.toJSONSchema(tools[remote.name].input);
    const theirs = remote.inputSchema.properties;
    assert.deepEqual(Object.keys(local.properties).sort(), Object.keys(theirs).sort());
    assert.deepEqual(local.required ?? [], remote.inputSchema.required ?? []);
    for (const [key, prop] of Object.entries(local.properties)) {
      assert.equal(prop.type, theirs[key].type, `${key} type`);
      assert.deepEqual(prop.enum?.toSorted(), theirs[key].enum?.toSorted(), `${key} values`);
      for (const bound of ["minimum", "maximum", "minLength", "maxLength"])
        if (theirs[key][bound] !== undefined && theirs[key][bound] < Number.MAX_SAFE_INTEGER)
          assert.equal(prop[bound], theirs[key][bound], `${key} ${bound}`);
    }
  });

  test(`${remote.name} is safe to send twice on the hosted server`, () => {
    assert.equal(remote.annotations.destructiveHint, false);
    assert.equal(remote.annotations.idempotentHint, true);
  });
}

test("every input has a description a model can use", () => {
  for (const [name, spec] of Object.entries(tools)) {
    assert.ok(spec.description.length > 80, name);
    for (const [key, prop] of Object.entries(z.toJSONSchema(spec.input).properties))
      assert.ok(prop.description, `${name}.${key}`);
  }
});
