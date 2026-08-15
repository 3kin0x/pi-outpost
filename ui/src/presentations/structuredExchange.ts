/**
 * What a validated envelope means for the reader, and where things go on screen.
 *
 * All pure: the components below render what these functions decide, so the
 * decisions can be tested without mounting anything. That matters more than usual
 * here — a proposal's rendering is an approval gate, and "what did the reader
 * actually see" has to be answerable.
 */
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

/**
 * A deterministic layered layout.
 *
 * Depth is the longest path from any element nothing points at; within a layer,
 * declaration order decides. Deterministic because the same document must draw
 * the same way every time — a reader approving a proposal should not have to
 * wonder whether the picture moved for a reason.
 *
 * Geometry carries no meaning: it is chosen so the thing can be read, and the
 * textual equivalent beside it is what states the relationships.
 */
export function layerGraph(data: StructuredGraphData): { id: string; depth: number; order: number }[] {
  const indegree = new Map<string, number>();
  for (const node of data.nodes) indegree.set(node.id, 0);
  for (const edge of data.edges) {
    if (indegree.has(edge.to)) indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const depth = new Map<string, number>();
  for (const node of data.nodes) depth.set(node.id, 0);

  // Relax along declared edges, bounded by the node count: a cycle cannot make
  // this run forever, it just stops improving.
  for (let pass = 0; pass < data.nodes.length; pass++) {
    let moved = false;
    for (const edge of data.edges) {
      const from = depth.get(edge.from);
      const to = depth.get(edge.to);
      if (from === undefined || to === undefined) continue;
      if (to < from + 1) {
        depth.set(edge.to, from + 1);
        moved = true;
      }
    }
    if (!moved) break;
  }

  const perLayer = new Map<number, number>();
  return data.nodes.map((node) => {
    const nodeDepth = depth.get(node.id) ?? 0;
    const order = perLayer.get(nodeDepth) ?? 0;
    perLayer.set(nodeDepth, order + 1);
    return { id: node.id, depth: nodeDepth, order };
  });
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
      lines.push(`  participant ${safeId(participant.id)} as ${escapeMermaid(displayLabel(participant))}`);
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

/** Producer identifiers are opaque; mermaid's syntax is not. Keep them apart. */
function safeId(id: string): string {
  return `n${[...id].map((character) => character.charCodeAt(0).toString(36)).join("")}`;
}

function escapeMermaid(text: string): string {
  return text.replace(/"/g, "#quot;").replace(/[\r\n]+/g, " ");
}
