/**
 * `work_plan`'s tool schema, submitted to the model on essentially every
 * turn once a session has a plan, once carried an unanchored `pattern:
 * "\\S"` on every bounded-text field (id, title, description, reason, …).
 * JSON Schema `pattern` is a "contains a match" test, so that was correct
 * behaviourally, but providers that compile the schema into a parser or
 * grammar for constrained decoding require every `pattern` to be fully
 * anchored (`^`…`$`) and reject the whole tool schema otherwise — as a 400
 * repeated once per occurrence of the field. These tests guard against that
 * regressing, and pin the field's actual accept/reject behaviour.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { workPlanParameters } from "../src/workPlanTool.ts";

/** Every `pattern` anywhere in a (possibly nested) JSON Schema node. */
function collectPatterns(schema: unknown, out: string[] = []): string[] {
  if (schema === null || typeof schema !== "object") return out;
  const node = schema as Record<string, unknown>;
  if (typeof node.pattern === "string") out.push(node.pattern);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) collectPatterns(item, out);
    } else if (value !== null && typeof value === "object") {
      collectPatterns(value, out);
    }
  }
  return out;
}

describe("work_plan tool schema", () => {
  test("every pattern is anchored, as constrained-decoding parser generation requires", () => {
    const patterns = collectPatterns(workPlanParameters);
    assert.ok(patterns.length > 0, "expected the schema to carry at least one pattern");
    for (const pattern of patterns) {
      assert.ok(pattern.startsWith("^"), `pattern ${JSON.stringify(pattern)} must start with '^'`);
      assert.ok(pattern.endsWith("$"), `pattern ${JSON.stringify(pattern)} must end with '$'`);
    }
  });

  test("the bounded-text pattern still rejects blank text and accepts everything else", () => {
    const patterns = collectPatterns(workPlanParameters);
    const boundedTextPattern = patterns.find((pattern) => pattern.includes("\\S"));
    assert.ok(boundedTextPattern, "expected to find the bounded-text non-whitespace pattern");
    const re = new RegExp(boundedTextPattern);
    assert.equal(re.test(""), false);
    assert.equal(re.test("   "), false);
    assert.equal(re.test("\n\t"), false);
    assert.equal(re.test("hello"), true);
    assert.equal(re.test("  hi  "), true);
  });
});
