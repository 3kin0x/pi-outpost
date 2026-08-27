/**
 * The census a stack-exhausted turn leaves behind.
 *
 * The point of these is the first test: the probe must survive an input deep
 * enough to kill a recursive one, because that is the only input anybody will
 * ever run it on. A depth measurement that overflows while measuring depth
 * reports a crash instead of the number the investigation needs.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { inspectShape, isStackExhaustion, recordTurnFailure, serializedBytes } from "../src/turnFailureLog.ts";

/** Nested `{ next: { next: … } }`, built iteratively so the fixture is not the bug. */
function deepChain(levels: number): unknown {
  let node: Record<string, unknown> = {};
  for (let i = 0; i < levels; i++) node = { next: node };
  return node;
}

describe("isStackExhaustion", () => {
  it("recognises what the provider actually puts in the bubble", () => {
    // Verbatim V8, which is what survives `error.message` in every provider catch.
    assert.equal(isStackExhaustion("Maximum call stack size exceeded"), true);
    assert.equal(isStackExhaustion("Auto-compaction failed: Maximum call stack size exceeded"), true);
    assert.equal(isStackExhaustion("RangeError: Maximum call stack size exceeded"), true);
  });

  it("stays narrow, so the common failures do not bury the rare one", () => {
    for (const message of [
      "429 rate limit reached; retry in 20s",
      "Connection lost",
      "The provider refused the request: context length exceeded",
      "Anthropic stream ended without a stop reason",
    ]) {
      assert.equal(isStackExhaustion(message), false, message);
    }
  });
});

describe("inspectShape", () => {
  it("measures a depth that would overflow a recursive probe", () => {
    // 60k levels: comfortably past the ~11k frames V8 gives a simple recursion,
    // so a recursive implementation of this function fails here and this one
    // must not.
    const census = inspectShape(deepChain(60_000));
    assert.equal(census.capped, true);
    assert.ok(census.depth >= 20_000, `expected the cap to be reached, got ${census.depth}`);
    assert.equal(census.cyclic, false);
  });

  it("reports the depth of an ordinary payload exactly", () => {
    // { a: [ { b: 1 } ] } — value 1, array 2, object 3, number 4.
    assert.deepEqual(inspectShape({ a: [{ b: 1 }] }), { depth: 4, cyclic: false, capped: false });
    assert.deepEqual(inspectShape("text"), { depth: 1, cyclic: false, capped: false });
    assert.deepEqual(inspectShape(null), { depth: 1, cyclic: false, capped: false });
  });

  it("flags a self-reference, the shape that has already caused this failure here", () => {
    // jiti's interop `default`, which pointed a schema at itself and sent
    // TypeBox's compiler round forever. See structuredExchangeSchemaNode.ts.
    const decorated: Record<string, unknown> = { $id: "urn:test", type: "object" };
    decorated.default = decorated;
    const census = inspectShape(decorated);
    assert.equal(census.cyclic, true);
    assert.equal(census.capped, false);
  });

  it("does not mistake a shared subobject for a cycle", () => {
    // Reached twice by different routes is ordinary; reachable from itself is not.
    const shared = { value: 1 };
    const census = inspectShape({ left: shared, right: shared });
    assert.equal(census.cyclic, false);
    assert.equal(census.depth, 3);
  });
});

describe("serializedBytes", () => {
  it("measures what a payload weighs", () => {
    assert.equal(serializedBytes({ a: 1 }), Buffer.byteLength(JSON.stringify({ a: 1 })));
  });

  it("returns null rather than throwing on the two shapes under investigation", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    assert.equal(serializedBytes(cyclic), null);
    assert.equal(serializedBytes(deepChain(200_000)), null);
  });
});

describe("recordTurnFailure", () => {
  const withAgentDir = (run: (dir: string) => void): void => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "turn-failure-"));
    try {
      run(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  const readRecords = (dir: string): Record<string, unknown>[] =>
    fs
      .readFileSync(path.join(dir, "turn-failures.jsonl"), "utf8")
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line));

  it("writes the message verbatim and names the deepest entry in the context", () => {
    withAgentDir((dir) => {
      recordTurnFailure(dir, {
        source: "assistant",
        message: "Maximum call stack size exceeded",
        assistantMessage: { provider: "anthropic", model: "claude-sonnet-5", stopReason: "error", content: [] },
        entries: [
          { id: "a", message: { role: "user", content: "hi" } },
          { id: "b", message: { role: "toolResult", content: deepChain(40) } },
        ],
      });

      const [record] = readRecords(dir);
      assert.equal(record.message, "Maximum call stack size exceeded");
      assert.equal(record.source, "assistant");
      assert.equal((record.turn as Record<string, unknown>).provider, "anthropic");
      const context = record.context as { count: number; deepest: { index: number; role: string; depth: number }[] };
      assert.equal(context.count, 2);
      // The deep one must be the one the record puts first, by index and by role.
      assert.equal(context.deepest[0].index, 1);
      assert.equal(context.deepest[0].role, "toolResult");
      assert.ok(context.deepest[0].depth > 40);
    });
  });

  it("keeps a provider's diagnostics verbatim — the only place a stack ever survives", () => {
    withAgentDir((dir) => {
      const diagnostics = [{ type: "stream_error", error: { name: "RangeError", stack: "RangeError: Maximum call stack size exceeded\n    at parse" } }];
      recordTurnFailure(dir, {
        source: "assistant",
        message: "Maximum call stack size exceeded",
        assistantMessage: { provider: "pi", diagnostics, content: [] },
      });
      const [record] = readRecords(dir);
      assert.deepEqual((record.turn as Record<string, unknown>).diagnostics, diagnostics);
    });
  });

  it("records a self-referential context without hanging or throwing", () => {
    withAgentDir((dir) => {
      const entry: Record<string, unknown> = { id: "a", message: { role: "user" } };
      entry.self = entry;
      recordTurnFailure(dir, { source: "runtime", message: "Maximum call stack size exceeded", entries: [entry] });
      const [record] = readRecords(dir);
      const context = record.context as { bytes: number | null; cyclic: { index: number }[] };
      assert.equal(context.cyclic.length, 1);
      assert.equal(context.cyclic[0].index, 0);
      // Unserializable is a finding, not a gap: it is what a cycle does to JSON.
      assert.equal(context.bytes, null);
    });
  });

  it("appends, so repeated occurrences can be compared against each other", () => {
    withAgentDir((dir) => {
      for (const source of ["assistant", "compaction"] as const) {
        recordTurnFailure(dir, { source, message: "Maximum call stack size exceeded" });
      }
      const records = readRecords(dir);
      assert.equal(records.length, 2);
      assert.deepEqual(records.map((one) => one.source), ["assistant", "compaction"]);
    });
  });
});
