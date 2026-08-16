/**
 * The structured-exchange contract.
 *
 * The schema file is the normative artifact, so what is tested here is that the
 * code around it cannot quietly disagree with it: the mirrored ceilings, the
 * conditional-required rules that make patch semantics expressible, and the
 * shape a producer is entitled to rely on.
 *
 * These live under server/ rather than shared/ for a blunt reason: CI runs the
 * server and ui test suites and nothing else, so a suite in shared/ would be a
 * suite nobody runs.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { Check } from "typebox/value";
import { STRUCTURED_EXCHANGE_CEILINGS, STRUCTURED_EXCHANGE_SCHEMA_V1, PROPOSABLE_KINDS } from "@pi-outpost/shared/structured-exchange";

const SCHEMA_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../shared/schemas/structured-exchange-1.json",
);
const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));

/** The three data variants, by the property that identifies each. */
const [graphVariant, sequenceVariant, tableVariant] = schema.properties.data.oneOf;

/** A minimal valid envelope of each kind, for tests that vary one thing. */
const graph = (over: Record<string, unknown> = {}) => ({
  schema: STRUCTURED_EXCHANGE_SCHEMA_V1,
  kind: "graph",
  data: { nodes: [{ id: "a", label: "A" }], edges: [] },
  ...over,
});

describe("structured-exchange schema", () => {
  test("declares the version-1 identifier as its own constant", () => {
    assert.equal(schema.$id, STRUCTURED_EXCHANGE_SCHEMA_V1);
    assert.equal(schema.properties.schema.const, STRUCTURED_EXCHANGE_SCHEMA_V1);
  });

  test("refuses anything it did not declare", () => {
    assert.equal(schema.additionalProperties, false);
    assert.equal(Check(schema, graph({ unexpected: 1 })), false);
  });

  test("requires only what a document cannot do without", () => {
    assert.deepEqual(schema.required, ["schema", "kind", "data"]);
    // target and removals are what make a document a proposal; neither is required
    assert.equal(Check(schema, graph()), true);
  });

  // -------------------------------------------------------------------------
  // Ceilings: mirrored in code, and the mirror must not drift
  // -------------------------------------------------------------------------
  describe("ceilings", () => {
    const collections: [keyof typeof STRUCTURED_EXCHANGE_CEILINGS, unknown][] = [
      ["nodes", graphVariant.properties.nodes.maxItems],
      ["edges", graphVariant.properties.edges.maxItems],
      ["participants", sequenceVariant.properties.participants.maxItems],
      ["messages", sequenceVariant.properties.messages.maxItems],
      ["columns", tableVariant.properties.columns.maxItems],
      ["rows", tableVariant.properties.rows.maxItems],
      ["removals", schema.properties.removals.maxItems],
    ];

    for (const [name, declared] of collections) {
      test(`${name} matches the schema`, () => {
        assert.equal(STRUCTURED_EXCHANGE_CEILINGS[name], declared, `${name} ceiling drifted from the schema`);
      });
    }

    const strings: [keyof typeof STRUCTURED_EXCHANGE_CEILINGS, unknown][] = [
      ["ref", schema.$defs.ref.maxLength],
      ["localId", schema.$defs.localId.maxLength],
      ["label", schema.$defs.label.maxLength],
      ["kind", schema.$defs.kind.maxLength],
      ["columnName", tableVariant.properties.columns.items.maxLength],
      ["cell", tableVariant.properties.rows.items.items.maxLength],
    ];

    for (const [name, declared] of strings) {
      test(`${name} length matches the schema`, () => {
        assert.equal(STRUCTURED_EXCHANGE_CEILINGS[name], declared, `${name} ceiling drifted from the schema`);
      });
    }

    test("every collection and string in the schema is bounded", () => {
      // Walks the schema rather than listing what to check, so a collection added
      // later without a bound fails here instead of shipping unbounded.
      const unbounded: string[] = [];
      const walk = (node: unknown, at: string) => {
        if (node === null || typeof node !== "object") return;
        const it = node as Record<string, unknown>;
        if (it.type === "array" && it.maxItems === undefined) unbounded.push(`${at} (array)`);
        if (it.type === "string" && it.maxLength === undefined && it.const === undefined && it.enum === undefined) {
          unbounded.push(`${at} (string)`);
        }
        for (const [key, value] of Object.entries(it)) walk(value, `${at}/${key}`);
      };
      walk(schema, "#");
      assert.deepEqual(unbounded, [], `unbounded: ${unbounded.join(", ")}`);
    });
  });

  // -------------------------------------------------------------------------
  // Patch semantics, as far as the schema can express them
  // -------------------------------------------------------------------------
  describe("patch semantics", () => {
    test("a new element must declare its label", () => {
      assert.equal(Check(schema, graph({ data: { nodes: [{ id: "a" }], edges: [] } })), false);
      assert.equal(Check(schema, graph({ data: { nodes: [{ id: "a", label: "A" }], edges: [] } })), true);
    });

    test("a referenced element may declare nothing else, and is then context", () => {
      assert.equal(Check(schema, graph({ data: { nodes: [{ id: "a", ref: "R" }], edges: [] } })), true);
    });

    test("an element and a relationship share one definition of a type", () => {
      // Two definitions of the same idea drift. A reader colours by this field on
      // both, so they have to mean the same thing and be bounded the same way.
      assert.deepEqual(schema.$defs.element.properties.kind, { $ref: "#/$defs/kind" });
      assert.deepEqual(schema.$defs.edge.properties.kind, { $ref: "#/$defs/kind" });
    });

    test("an element may declare its type, and a patch may retype it", () => {
      const typed = { id: "a", label: "A", kind: "block" };
      assert.equal(Check(schema, graph({ data: { nodes: [typed], edges: [] } })), true);
      assert.equal(
        Check(schema, graph({ data: { nodes: [{ id: "a", ref: "R", set: { kind: "sensor" } }], edges: [] } })),
        true,
      );
      // Still opaque: no enumeration, any non-empty domain vocabulary goes through
      assert.equal(Check(schema, graph({ data: { nodes: [{ id: "a", label: "A", kind: "«subsystem»" }], edges: [] } })), true);
      assert.equal(Check(schema, graph({ data: { nodes: [{ id: "a", label: "A", kind: "" }], edges: [] } })), false);
    });

    test("a referenced element may patch just its label", () => {
      assert.equal(Check(schema, graph({ data: { nodes: [{ id: "a", ref: "R", label: "renamed" }], edges: [] } })), true);
    });

    test("a new relationship must declare its kind, a referenced one need not", () => {
      const nodes = [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ];
      assert.equal(Check(schema, graph({ data: { nodes, edges: [{ from: "a", to: "b" }] } })), false);
      assert.equal(Check(schema, graph({ data: { nodes, edges: [{ from: "a", to: "b", kind: "k" }] } })), true);
      assert.equal(Check(schema, graph({ data: { nodes, edges: [{ from: "a", to: "b", ref: "R" }] } })), true);
    });

    test("a relationship always declares its endpoints, referenced or not", () => {
      // Endpoints are identity, not state: even a patch restates them, so the
      // approval view can always place what it shows.
      const nodes = [{ id: "a", label: "A" }];
      assert.equal(Check(schema, graph({ data: { nodes, edges: [{ ref: "R", label: "renamed" }] } })), false);
    });
  });

  // -------------------------------------------------------------------------
  // Removals
  // -------------------------------------------------------------------------
  describe("removals", () => {
    test("say what kind of thing they name", () => {
      assert.equal(Check(schema, graph({ target: "T", removals: [{ ref: "R" }] })), false);
      assert.equal(Check(schema, graph({ target: "T", removals: [{ type: "element", ref: "R" }] })), true);
      assert.equal(Check(schema, graph({ target: "T", removals: [{ type: "relationship", ref: "R" }] })), true);
    });

    test("refuse a kind of thing that is not one of the two", () => {
      assert.equal(Check(schema, graph({ target: "T", removals: [{ type: "attribute", ref: "R" }] })), false);
    });
  });

  // -------------------------------------------------------------------------
  // Kinds
  // -------------------------------------------------------------------------
  describe("kinds", () => {
    test("only graph and sequence may be proposed", () => {
      assert.deepEqual([...PROPOSABLE_KINDS], ["graph", "sequence"]);
      assert.deepEqual(schema.properties.kind.enum, ["graph", "sequence", "table"]);
    });

    test("the data variants are mutually exclusive, so oneOf can tell them apart", () => {
      const table = {
        schema: STRUCTURED_EXCHANGE_SCHEMA_V1,
        kind: "table",
        data: { columns: ["c"], rows: [["v"]] },
      };
      const sequence = {
        schema: STRUCTURED_EXCHANGE_SCHEMA_V1,
        kind: "sequence",
        data: { participants: [{ id: "p", label: "P" }], messages: [] },
      };
      assert.equal(Check(schema, table), true);
      assert.equal(Check(schema, sequence), true);
      // Mixing two variants matches neither branch cleanly
      assert.equal(Check(schema, graph({ data: { nodes: [{ id: "a", label: "A" }], edges: [], columns: ["c"] } })), false);
    });
  });
});

/**
 * The schema the agent reads, beside the schema the code validates against.
 *
 * The skill ships a copy so the agent can read the contract without leaving its
 * skill directory — `skillPaths` are read-only exceptions to the sandbox, so a
 * file there is reachable and one in the application's own tree is not. Two
 * copies means two things that can drift, which is what this refuses.
 */
describe("the skill's copy of the schema", () => {
  test("is identical to the one the runtime validates against", () => {
    const contract = readFileSync(SCHEMA_PATH, "utf8");
    const beside = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills/structured-exchange/structured-exchange-1.json"),
      "utf8",
    );

    assert.equal(beside, contract, "the skill's schema copy has drifted from the contract");
  });
});
