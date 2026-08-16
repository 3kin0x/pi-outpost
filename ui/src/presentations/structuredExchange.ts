/**
 * What a validated envelope means for the reader, and where things go on screen.
 *
 * All pure: the components below render what these functions decide, so the
 * decisions can be tested without mounting anything. That matters more than usual
 * here — a proposal's rendering is an approval gate, and "what did the reader
 * actually see" has to be answerable.
 */
import dagre from "@dagrejs/dagre";
import {
  parseSerializedStructuredExchange,
  type StructuredExchangeVerdict,
} from "@pi-outpost/shared/structured-exchange/parse";
import { checkStructuredExchangeSchemaInBrowser } from "@pi-outpost/shared/structured-exchange/schema-browser";
import type {
  StructuredElement,
  StructuredEdge,
  StructuredGraphData,
  StructuredMessage,
  StructuredSequenceData,
  ValidatedStructuredExchange,
} from "@pi-outpost/shared/structured-exchange";

/**
 * The verdict on a tool result's structured payload.
 *
 * Returns nothing at all for a result that carries none, or one that fails
 * validation. A caller therefore cannot accidentally render half a proposal:
 * half a proposal is never handed back.
 */
export function readStructuredExchange(structured: string | undefined): StructuredExchangeVerdict | undefined {
  if (structured === undefined || structured === "") return undefined;
  // Through the serialized entry point, not the parsed one: the byte bound has to
  // run before JSON.parse, and calling parseStructuredExchange directly skipped it
  // — which let an oversized result materialise in the browser, the one thing the
  // bound exists to prevent.
  const verdict = parseSerializedStructuredExchange(structured, checkStructuredExchangeSchemaInBrowser);
  return verdict.valid ? { valid: true, envelope: verdict.envelope, issues: [] } : verdict;
}

/** The validated envelope, or undefined — the shape a presentation's `match` wants. */
export function validStructuredExchange(structured: string | undefined): ValidatedStructuredExchange | undefined {
  const verdict = readStructuredExchange(structured);
  return verdict?.valid === true ? verdict.envelope : undefined;
}

/**
 * How each part of a proposal should read.
 *
 * - `added` — no reference, so the authority does not hold it yet.
 * - `changed` — a reference *and* something declared beside it.
 * - `context` — a reference and nothing else. Declares no change; it is named so
 *   a relationship can attach to it, and showing it as modified would make every
 *   proposal that adds a relationship look like it rewrites what it touches.
 * - `unchanged` — not a proposal at all; the envelope describes a new artifact.
 */
export type ChangeRole = "added" | "changed" | "context" | "unchanged";

export function elementRole(element: StructuredElement, isProposal: boolean): ChangeRole {
  if (!isProposal) return "unchanged";
  if (element.ref === undefined) return "added";
  return element.set === undefined ? "context" : "changed";
}

/**
 * The same rule for a relationship. Its endpoints are identity and its other
 * declared fields describe it; only `set` states an intention.
 */
export function relationshipRole(relationship: StructuredEdge | StructuredMessage, isProposal: boolean): ChangeRole {
  if (!isProposal) return "unchanged";
  if (relationship.ref === undefined) return "added";
  return relationship.set === undefined ? "context" : "changed";
}

/**
 * What a change does to one field, as a reader needs to see it.
 *
 * The described value is what the thing is called now, so an approval view can
 * finally show `Ledger → General Ledger` rather than asserting "changed" and
 * leaving the reader to wonder what it was. `from` is absent when the producer
 * declared no descriptive value — the change still stands, it just cannot be
 * shown as a before and after.
 */
export interface FieldChange {
  field: string;
  from?: string;
  to: string;
}

export function fieldChanges(subject: StructuredElement | StructuredEdge | StructuredMessage): FieldChange[] {
  const set = subject.set as Record<string, string> | undefined;
  if (set === undefined) return [];
  const described = subject as unknown as Record<string, unknown>;
  return Object.entries(set).map(([field, to]) => {
    const from = described[field];
    return { field, ...(typeof from === "string" ? { from } : {}), to };
  });
}

/** Human wording for a role, used in the approval view and its textual equivalent. */
export const ROLE_LABEL: Record<ChangeRole, string> = {
  added: "added",
  changed: "changed",
  context: "existing",
  unchanged: "",
};

/** Where an element sits, and how big its box is. */
export type PlacedNode = { id: string; x: number; y: number; width: number; height: number };

/** A point on the canvas. */
export type Point = { x: number; y: number };

/**
 * A route for one relationship, as the layout engine drew it.
 *
 * Keyed by the relationship's index in the document, because two relationships
 * between the same pair are two relationships and must not share a route: drawn as
 * straight lines between centres they landed exactly on top of each other, and the
 * diagram showed one line where the document had two.
 */
export type PlacedEdge = { index: number; points: Point[] };

/** A laid-out graph: boxes in a plane, the routes between them, and the extent. */
export type GraphLayout = { nodes: PlacedNode[]; edges: PlacedEdge[]; width: number; height: number };

/** Spacing between the boxes, in the same units as the sizes handed in. */
const RANK_GAP = 64;
const NODE_GAP = 24;
const MARGIN = 12;

/**
 * A layered layout, delegated to dagre.
 *
 * This used to be hand-rolled: longest-path ranking with a DFS to spot the edges
 * that close a cycle. It was a fraction of Sugiyama and it showed — a seventeen-node
 * architecture with feedback loops drew twenty thousand pixels wide and arrived on
 * screen as a sliver. Ranking is the easy quarter of the problem; ordering within a
 * rank to reduce crossings, and assigning coordinates so long edges stay straight,
 * are the parts that decide whether a diagram can be read, and they are a solved
 * problem worth importing rather than approximating.
 *
 * Deterministic: dagre is a pure function of the graph and the insertion order, and
 * both come from the document. The same document must draw the same way every time —
 * a reader approving a proposal should not have to wonder whether the picture moved
 * for a reason.
 *
 * Geometry still carries no meaning: it is chosen so the thing can be read, and the
 * textual equivalent beside it is what states the relationships.
 *
 * `size` is supplied by the caller because only the view knows its own text metrics,
 * and giving dagre a real size per box is what lets one long label widen its own box
 * instead of every box.
 */
export function layoutGraph(
  data: StructuredGraphData,
  size: (node: StructuredElement) => { width: number; height: number },
): GraphLayout {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: "LR", ranksep: RANK_GAP, nodesep: NODE_GAP, marginx: MARGIN, marginy: MARGIN });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of data.nodes) graph.setNode(node.id, size(node));
  // Named by index so two relationships between the same pair stay two edges;
  // collapsed, the second one would silently stop influencing the layout.
  data.edges.forEach((edge, index) => {
    // A self-loop is drawn by hand rather than routed: dagre reserves rank space for
    // one and still returns a degenerate path, which came out as a line of zero
    // length — a relationship the document declared and the picture did not show.
    if (edge.from !== edge.to && graph.hasNode(edge.from) && graph.hasNode(edge.to)) {
      graph.setEdge(edge.from, edge.to, {}, String(index));
    }
  });

  dagre.layout(graph);

  // dagre reports centres; boxes are drawn from their top-left corner.
  const nodes = data.nodes.map((node) => {
    const placed = graph.node(node.id) as { x: number; y: number; width: number; height: number } | undefined;
    const { width, height } = size(node);
    return {
      id: node.id,
      x: (placed?.x ?? MARGIN + width / 2) - width / 2,
      y: (placed?.y ?? MARGIN + height / 2) - height / 2,
      width,
      height,
    };
  });

  const edges: PlacedEdge[] = [];
  data.edges.forEach((edge, index) => {
    if (edge.from === edge.to) return;
    const routed = graph.edge(edge.from, edge.to, String(index)) as { points?: Point[] } | undefined;
    if (routed?.points !== undefined && routed.points.length > 0) {
      edges.push({ index, points: routed.points.map((point) => ({ x: point.x, y: point.y })) });
    }
  });

  // dagre's own graph extent ignores nothing, but a node it failed to place would
  // fall outside it, so measure what is actually drawn.
  const extent = nodes.reduce(
    (box, node) => ({ width: Math.max(box.width, node.x + node.width), height: Math.max(box.height, node.y + node.height) }),
    { width: 0, height: 0 },
  );

  return { nodes, edges, width: extent.width + MARGIN, height: extent.height + MARGIN };
}

/** Label to show for an element: its own when declared, else its reference. */
export function displayLabel(element: StructuredElement): string {
  return element.label ?? element.ref ?? element.id;
}

/**
 * The derived diagram export.
 *
 * Deterministic, and derived only from validated data — diagram syntax is never
 * read back to recover relationships, so this is a one-way door. Offered because
 * being able to get portable syntax *out* is part of why structured data is worth
 * carrying in.
 */
export function toMermaid(envelope: ValidatedStructuredExchange): string | undefined {
  if (envelope.kind === "graph") {
    const data = envelope.data as StructuredGraphData;
    const lines = ["flowchart TD"];
    for (const node of data.nodes) lines.push(`  ${safeId(node.id)}["${escapeMermaid(displayLabel(node))}"]`);
    for (const edge of data.edges) {
      const label = edge.label ?? edge.kind;
      const arrow = label === undefined ? "-->" : `-- "${escapeMermaid(label)}" -->`;
      lines.push(`  ${safeId(edge.from)} ${arrow} ${safeId(edge.to)}`);
    }
    return lines.join("\n");
  }
  if (envelope.kind === "sequence") {
    const data = envelope.data as StructuredSequenceData;
    const lines = ["sequenceDiagram"];
    for (const participant of data.participants) {
      lines.push(`  participant ${safeId(participant.id)} as "${escapeMermaid(displayLabel(participant))}"`);
    }
    for (const message of data.messages) {
      lines.push(`  ${safeId(message.from)}->>${safeId(message.to)}: ${escapeMermaid(message.label ?? "")}`);
    }
    return lines.join("\n");
  }
  // A table has no diagram form, and inventing one would be a second
  // representation nobody asked for.
  return undefined;
}

/**
 * Producer identifiers are opaque; mermaid's syntax is not. Keep them apart.
 *
 * Producer text is never an identifier. Every id in the export is generated here from
 * the character codes of the local id, so the only tokens that can name a node are
 * ones this function made.
 */
function safeId(id: string): string {
  return `n${[...id].map((character) => character.charCodeAt(0).toString(36)).join("")}`;
}

/**
 * Producer text, rendered so it cannot become syntax.
 *
 * The earlier version escaped quotes and newlines and let everything else through,
 * which was not enough: `;` separates statements in mermaid, so a participant named
 *
 *     A; participant injected as INJECTED
 *
 * declared a second participant that was in no document. The label was data and it
 * arrived as structure.
 *
 * `#` goes first and unconditionally. It opens mermaid's entity syntax, and it is
 * also what the escapes below are written in — escaping it second would let producer
 * text spell `#quot;` itself and reintroduce the quote it was denied.
 */
const MERMAID_ENTITY: Record<string, string> = {
  "#": "#35;",
  '"': "#quot;",
  ";": "#59;",
  "<": "#60;",
  ">": "#62;",
};

function escapeMermaid(text: string): string {
  return (
    text
      // One pass, so no replacement can be fed to another: escaping `#` first and `;`
      // second turned `#` into `#35;` and then into `#35#59;`, which decodes to
      // nothing at all. The escapes are written in the very character they escape.
      .replace(/[#";<>]/g, (character) => MERMAID_ENTITY[character])
      .replace(/[\r\n\t\f\v\u0000-\u001f\u2028\u2029]+/g, " ")
  );
}
