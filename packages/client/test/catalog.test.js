import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { tools } from "../dist/index.js";
import { hosted } from "./server.js";

// `npm run demo` checks the live tools/list the same way.

test("the catalog has the hosted server's tools, no more and no fewer", () => {
  assert.deepEqual(Object.keys(tools).sort(), hosted.map((t) => t.name).sort());
});

for (const remote of hosted) {
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

  test(`${remote.name} is read-only on the hosted server`, () => {
    assert.equal(remote.annotations.readOnlyHint, true);
    assert.equal(remote.annotations.destructiveHint, false);
  });
}

test("every input has a description a model can use", () => {
  for (const [name, spec] of Object.entries(tools)) {
    assert.ok(spec.description.length > 80, name);
    for (const [key, prop] of Object.entries(z.toJSONSchema(spec.input).properties))
      assert.ok(prop.description, `${name}.${key}`);
  }
});
