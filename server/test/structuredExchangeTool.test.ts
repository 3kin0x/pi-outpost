/**
 * The tool that makes the agent a producer.
 *
 * The interesting behaviour is not the happy path — it is what a *refused*
 * document does. A language model writes plausible-but-wrong JSON, so a contract
 * this strict is only usable if the refusal comes back as something the agent can
 * read and act on inside the same turn.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createStructuredExchangeToolDefinition } from "../src/structuredExchangeTool.ts";
import { STRUCTURED_EXCHANGE_SCHEMA_V1 as S } from "@pi-outpost/shared/structured-exchange";

const tool = createStructuredExchangeToolDefinition();

const call = (document: unknown, summary = "a summary") =>
  tool.execute("call-1", { document: typeof document === "string" ? document : JSON.stringify(document), summary }) as Promise<{
    content: { type: string; text: string }[];
    details?: unknown;
    isError?: boolean;
  }>;

const graph = (over: Record<string, unknown> = {}) => ({
  schema: S,
  kind: "graph",
  data: {
    nodes: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    edges: [{ from: "a", to: "b", kind: "calls" }],
  },
  ...over,
});

describe("present_structure", () => {
  test("puts a validated document on the channel the interface reads", async () => {
    const result = await call(graph());

    assert.equal(result.isError, undefined);
    assert.equal((result.details as { schema: string }).schema, S);
    assert.equal((result.details as { kind: string }).kind, "graph");
  });

  test("carries the agent's summary in the text, because the document will not come back to it", async () => {
    const result = await call(graph(), "Billing calls Ledger.");

    const text = result.content[0].text;
    assert.match(text, /Billing calls Ledger\./);
    // Plus a factual digest, so the summary is never the only account of what was sent
    assert.match(text, /2 elements, 1 relationships/);
  });

  test("tallies what the reader will see, since the agent will not see it", async () => {
    const result = await call(
      graph({ target: "architecture-v4", removals: [{ type: "relationship", ref: "REL-9" }] }),
    );

    assert.match(result.content[0].text, /proposing changes to "architecture-v4"/);
    assert.match(result.content[0].text, /3 added, 0 changed/);
    assert.match(result.content[0].text, /1 removed/);
  });

  test("says so when a proposal turns out to change nothing", async () => {
    // The mistake this catches, seen for real in the running app: the agent wrote
    // the new name beside the reference instead of in `set`, which declares the
    // current value and applies nothing. Inert is right; silent is not.
    const result = await call(
      graph({
        target: "architecture-v4",
        data: { nodes: [{ id: "a", ref: "EL-7", label: "General Ledger" }], edges: [] },
      }),
    );

    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /0 changed/);
    assert.match(result.content[0].text, /changes nothing/);
    assert.match(result.content[0].text, /goes in "set"/);
  });

  describe("a refusal is something the agent can act on", () => {
    test("comes back as an error, not as an empty presentation", async () => {
      const result = await call(graph({ data: { nodes: [{ id: "a", label: "A" }], edges: [{ from: "a", to: "zz", kind: "k" }] } }));

      assert.equal(result.isError, true);
      assert.equal(result.details, undefined);
    });

    test("names the rule and points at the offending value", async () => {
      const result = await call(graph({ data: { nodes: [{ id: "a", label: "A" }], edges: [{ from: "a", to: "zz", kind: "k" }] } }));

      const text = result.content[0].text;
      assert.match(text, /unresolved-endpoint/);
      assert.match(text, /\/data\/edges\/0\/to/);
      assert.match(text, /call again/);
    });

    test("says that nothing is corrected for it", async () => {
      // Without this the agent may assume a near-miss was fixed silently.
      const result = await call(graph({ data: { nodes: [{ id: "a", label: "A" }], edges: [{ from: "a", to: "aa", kind: "k" }] } }));

      assert.match(result.content[0].text, /not guessed at/);
    });

    test("reports every broken rule at once", async () => {
      const result = await call(
        graph({
          data: {
            nodes: [
              { id: "a", label: "A" },
              { id: "a", label: "again" },
            ],
            edges: [{ from: "a", to: "missing", kind: "k" }],
          },
        }),
      );

      const text = result.content[0].text;
      assert.match(text, /duplicate-identifier/);
      assert.match(text, /unresolved-endpoint/);
    });

    test("refuses a document that is not JSON at all", async () => {
      const result = await call("{ this is not json");

      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /not-json/);
    });

    test("refuses a table that tries to be a proposal", async () => {
      const result = await call({ schema: S, kind: "table", target: "T", data: { columns: ["c"], rows: [["v"]] } });

      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /kind-not-proposable/);
    });
  });

  test("a corrected document is accepted on the next call", async () => {
    // The loop the skill tells the agent to run, end to end.
    const refused = await call(graph({ data: { nodes: [{ id: "a", label: "A" }], edges: [{ from: "a", to: "b", kind: "k" }] } }));
    assert.equal(refused.isError, true);

    const accepted = await call(graph());
    assert.equal(accepted.isError, undefined);
    assert.ok(accepted.details !== undefined);
  });
});
