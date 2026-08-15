/**
 * The structured-exchange envelope: structured data travelling between a tool and
 * this application, in either direction.
 *
 * The normative contract is `shared/schemas/structured-exchange-1.json`, not this
 * file. These types are derived from it for the convenience of code that has
 * already validated a document; they are not the interchange contract, and an
 * independent producer validates against the schema rather than against them.
 *
 * Two identities live on every element and must not be conflated:
 *   - `id`  is scoped to this envelope. Relationships refer to it, and it means
 *           nothing outside the document it appears in.
 *   - `ref` is the join to something the receiving authority already holds.
 *           Absent means "does not exist there yet".
 */

/** Version-1 schema identifier; the `schema` field must equal this exactly. */
export const STRUCTURED_EXCHANGE_SCHEMA_V1 = "urn:structured-exchange:1";

/** Which presentations exist. Only `graph` and `sequence` may be proposed. */
export type StructuredExchangeKind = "graph" | "sequence" | "table";

/** Kinds a proposal may target: a table is a projection and cannot be applied. */
export const PROPOSABLE_KINDS: readonly StructuredExchangeKind[] = ["graph", "sequence"];

/**
 * An element of a graph or a sequence.
 *
 * On an element carrying a `ref`, the declared fields **describe what already
 * exists** — they are there so a reader can recognise it, and applying them
 * changes nothing. A change is stated separately, in `set`.
 *
 * The default runs that way round on purpose. A producer here may be a language
 * model, and it will sometimes forget the ceremony; the question is what that
 * costs. Under the opposite default — declaring a field means setting it — a
 * forgotten marker turns twenty elements included for context into twenty
 * renames the reader approves and the authority applies. Under this one, a
 * forgotten `set` changes nothing and somebody says "it didn't work".
 *
 * An element with no `ref` is new: there is nothing to describe yet, so `label`
 * is simply its value.
 */
export interface StructuredElement {
  id: string;
  ref?: string;
  label?: string;
  set?: { label?: string };
}

/**
 * A directed relationship in a graph.
 *
 * `from`/`to` are envelope-scoped element ids and are always present: a
 * relationship's endpoints are its identity, not its state, so they are declared
 * even on a patch and are never read as a request to move it. Re-attaching is a
 * removal plus a creation.
 *
 * `kind` is opaque. The renderer may show it and may use it to tell two otherwise
 * identical relationships apart; it never interprets the value, and the schema
 * never enumerates the possibilities — that vocabulary belongs to the producer.
 */
export interface StructuredEdge {
  from: string;
  to: string;
  kind?: string;
  ref?: string;
  label?: string;
  set?: { kind?: string; label?: string };
}

/** One message of a sequence. Endpoints are identity, as for a relationship. */
export interface StructuredMessage {
  from: string;
  to: string;
  ref?: string;
  label?: string;
  set?: { label?: string };
}

export interface StructuredGraphData {
  nodes: StructuredElement[];
  edges: StructuredEdge[];
}

export interface StructuredSequenceData {
  participants: StructuredElement[];
  messages: StructuredMessage[];
}

export type StructuredTableCell = string | number | boolean | null;

export interface StructuredTableData {
  columns: string[];
  rows: StructuredTableCell[][];
}

export type StructuredExchangeData = StructuredGraphData | StructuredSequenceData | StructuredTableData;

/**
 * A declared removal. A reference alone does not say what it names — the same
 * string may identify an element in one collection and a relationship in another —
 * so a removal always says which.
 */
export interface StructuredRemoval {
  type: "element" | "relationship";
  ref: string;
}

/**
 * The envelope.
 *
 * `target` decides what the document is: present makes it a patch of that
 * artifact, absent makes it a complete new one. Never inferred from whether
 * references happen to appear — a proposal that only adds elements carries none,
 * and reading that as "start over" would misread the most ordinary proposal there
 * is.
 */
export interface StructuredExchangeEnvelope {
  schema: typeof STRUCTURED_EXCHANGE_SCHEMA_V1;
  kind: StructuredExchangeKind;
  target?: string;
  removals?: StructuredRemoval[];
  data: StructuredExchangeData;
}

/** A validated envelope, narrowed to the data variant its kind declares. */
export type ValidatedStructuredExchange =
  | (StructuredExchangeEnvelope & { kind: "graph"; data: StructuredGraphData })
  | (StructuredExchangeEnvelope & { kind: "sequence"; data: StructuredSequenceData })
  | (StructuredExchangeEnvelope & { kind: "table"; data: StructuredTableData });

/** True when the envelope proposes a change to something that already exists. */
export function isProposal(envelope: StructuredExchangeEnvelope): boolean {
  return envelope.target !== undefined;
}

/**
 * The bounds the schema enforces. Mirrored here so code can report a limit
 * without re-reading the schema, and asserted against it by test so the two
 * cannot drift.
 *
 * These are *ceilings*: stable for the life of schema version 1, and what any
 * producer may assume is accepted wherever version 1 is supported. A deployment
 * may apply a stricter operational limit; it may never raise one.
 */
export const STRUCTURED_EXCHANGE_CEILINGS = {
  nodes: 500,
  edges: 2000,
  participants: 100,
  messages: 1000,
  columns: 50,
  rows: 5000,
  removals: 500,
  ref: 200,
  localId: 200,
  label: 500,
  edgeKind: 100,
  columnName: 200,
  cell: 1000,
} as const;
