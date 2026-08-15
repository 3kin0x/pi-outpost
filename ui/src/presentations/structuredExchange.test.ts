import { describe, it, expect } from "vitest";
import {
  displayLabel,
  elementRole,
  fieldChanges,
  layerGraph,
  readStructuredExchange,
  relationshipRole,
  toMermaid,
  validStructuredExchange,
} from "./structuredExchange";
import { STRUCTURED_EXCHANGE_SCHEMA_V1 as S } from "@pi-outpost/shared/structured-exchange";

const graph = (over: Record<string, unknown> = {}) => ({
  schema: S,
  kind: "graph",
  data: { nodes: [{ id: "a", label: "A" }], edges: [] },
  ...over,
});
const serialize = (document: unknown) => JSON.stringify(document);

describe("readStructuredExchange", () => {
  it("returns nothing when a result carries no structured payload", () => {
    expect(readStructuredExchange(undefined)).toBeUndefined();
    expect(readStructuredExchange("")).toBeUndefined();
  });

  it("reports why a payload that is not JSON was refused, rather than going quiet", () => {
    const verdict = readStructuredExchange("{not json");

    expect(verdict?.valid).toBe(false);
    expect(verdict?.valid === false && verdict.issues[0].rule).toBe("not-json");
    // What `match` consumes is still nothing at all, so no presentation is selected
    expect(validStructuredExchange("{not json")).toBeUndefined();
  });

  it("refuses an oversized payload before parsing it", () => {
    // The browser has to apply the byte bound too: routing straight to a parse
    // let an oversized result materialise, which is the one thing the bound exists
    // to prevent.
    const oversized = `{"schema":"${S}","junk":"${"x".repeat(5_000_000)}`;

    const verdict = readStructuredExchange(oversized);

    expect(verdict?.valid).toBe(false);
    expect(verdict?.valid === false && verdict.issues[0].rule).toBe("document-too-large");
  });

  it("refuses rather than repairs a document with an unresolved endpoint", () => {
    const verdict = readStructuredExchange(
      serialize(graph({ data: { nodes: [{ id: "a", label: "A" }], edges: [{ from: "a", to: "aa", kind: "k" }] } })),
    );

    expect(verdict?.valid).toBe(false);
    expect(validStructuredExchange(serialize(graph({ data: { nodes: [], edges: [] } })))).toBeUndefined();
  });

  it("accepts a conforming document", () => {
    expect(validStructuredExchange(serialize(graph()))?.kind).toBe("graph");
  });
});

describe("what each part of a proposal means", () => {
  it("treats an element with no reference as an addition", () => {
    expect(elementRole({ id: "a", label: "A" }, true)).toBe("added");
  });

  it("treats a reference with a declared change as a change", () => {
    expect(elementRole({ id: "a", ref: "R", set: { label: "renamed" } }, true)).toBe("changed");
  });

  it("treats a referenced element's own fields as description, not intent", () => {
    // The case the whole default turns on: an element included so the reader can
    // recognise it, carrying its current name, is not a rename.
    expect(elementRole({ id: "a", ref: "R", label: "Billing" }, true)).toBe("context");
    expect(elementRole({ id: "a", ref: "R" }, true)).toBe("context");
  });

  it("marks nothing when the envelope is a new artifact rather than a proposal", () => {
    expect(elementRole({ id: "a", label: "A" }, false)).toBe("unchanged");
    expect(elementRole({ id: "a", ref: "R", label: "A" }, false)).toBe("unchanged");
  });

  it("reads a relationship's declared fields as description too", () => {
    // Endpoints are identity and the rest describes; only `set` states intent.
    expect(relationshipRole({ from: "a", to: "b", ref: "R" }, true)).toBe("context");
    expect(relationshipRole({ from: "a", to: "b", ref: "R", kind: "calls" }, true)).toBe("context");
    expect(relationshipRole({ from: "a", to: "b", ref: "R", set: { kind: "invokes" } }, true)).toBe("changed");
    expect(relationshipRole({ from: "a", to: "b", kind: "composition" }, true)).toBe("added");
  });

  it("reports a change as a before and after when the current value was described", () => {
    expect(fieldChanges({ id: "a", ref: "R", label: "Ledger", set: { label: "General Ledger" } })).toEqual([
      { field: "label", from: "Ledger", to: "General Ledger" },
    ]);
  });

  it("reports a change without a before when no current value was described", () => {
    // The change still stands; it simply cannot be shown as a transition.
    expect(fieldChanges({ id: "a", ref: "R", set: { label: "General Ledger" } })).toEqual([
      { field: "label", to: "General Ledger" },
    ]);
  });

  it("reports nothing for something that declares no change", () => {
    expect(fieldChanges({ id: "a", ref: "R", label: "Ledger" })).toEqual([]);
  });
});

describe("layout", () => {
  const chain = {
    nodes: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ],
    edges: [
      { from: "a", to: "b", kind: "k" },
      { from: "b", to: "c", kind: "k" },
    ],
  };

  it("places a chain in successive layers", () => {
    const placed = layerGraph(chain);
    expect(placed.map((entry) => entry.depth)).toEqual([0, 1, 2]);
  });

  it("is deterministic: the same document lays out the same way", () => {
    expect(layerGraph(chain)).toEqual(layerGraph(chain));
  });

  it("terminates on a cycle instead of relaxing forever", () => {
    const cycle = {
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [
        { from: "a", to: "b", kind: "k" },
        { from: "b", to: "a", kind: "k" },
      ],
    };
    expect(() => layerGraph(cycle)).not.toThrow();
    expect(layerGraph(cycle)).toHaveLength(2);
  });

  it("falls back to a reference when an element declares no label", () => {
    expect(displayLabel({ id: "a", ref: "EL-1" })).toBe("EL-1");
    expect(displayLabel({ id: "a", ref: "EL-1", label: "Named" })).toBe("Named");
  });
});

describe("derived diagram export", () => {
  const envelope = validStructuredExchange(
    serialize({
      schema: S,
      kind: "graph",
      data: {
        nodes: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        edges: [{ from: "a", to: "b", kind: "composition" }],
      },
    }),
  )!;

  it("carries exactly the elements and relationships of the data it came from", () => {
    const mermaid = toMermaid(envelope)!;
    expect(mermaid).toContain("flowchart TD");
    expect(mermaid).toContain('"A"');
    expect(mermaid).toContain('"B"');
    expect(mermaid.match(/-->/g) ?? []).toHaveLength(1);
  });

  it("is deterministic", () => {
    expect(toMermaid(envelope)).toBe(toMermaid(envelope));
  });

  it("keeps producer text from becoming diagram syntax", () => {
    const hostile = validStructuredExchange(
      serialize({
        schema: S,
        kind: "graph",
        data: { nodes: [{ id: "a", label: 'A" --> evil["pwned' }], edges: [] },
      }),
    )!;

    const mermaid = toMermaid(hostile)!;
    // The label's own quotes are entity-escaped, so its text — arrows and all —
    // stays inside one node declaration. What matters is that no *structure*
    // appeared: still one node, still no relationship.
    const declarations = mermaid.split("\n").filter((line) => /^\s+n\w+\[/.test(line));
    const relationships = mermaid.split("\n").filter((line) => /^\s+n\w+ .*-->/.test(line));
    expect(declarations).toHaveLength(1);
    expect(relationships).toHaveLength(0);
    expect(mermaid).not.toContain('evil["pwned"]');
  });

  it("offers nothing for a table, rather than inventing a diagram for it", () => {
    const table = validStructuredExchange(serialize({ schema: S, kind: "table", data: { columns: ["c"], rows: [["v"]] } }))!;
    expect(toMermaid(table)).toBeUndefined();
  });
});
