/**
 * The relational half of validation.
 *
 * JSON Schema decides shape; these are the rules it cannot express — that
 * identifiers are unique, that an endpoint resolves to something declared, that a
 * row matches its columns, that the declared kind agrees with the data, and that
 * a proposal does not state two intentions about the same thing at once.
 *
 * Pure and deterministic on purpose: the same code answers for the application,
 * for the reference command-line interface, and for anything else that needs the
 * verdict. Neither stage may repair, complete, or guess — a document that fails
 * yields no structured result, and the diagnostics say why so the producer can
 * fix it and try again.
 */
import {
  PROPOSABLE_KINDS,
  STRUCTURED_EXCHANGE_CEILINGS,
  type StructuredElement,
  type StructuredExchangeEnvelope,
  type StructuredGraphData,
  type StructuredSequenceData,
  type StructuredTableData,
  type ValidatedStructuredExchange,
} from "./structuredExchange.ts";

/**
 * One reason a document was refused.
 *
 * `path` is a JSON Pointer into the document, so a producer can be told where to
 * look rather than what we think it meant. `limit`/`observed` are populated when a
 * bound was exceeded, because "too large" without both numbers is not something an
 * operator can act on.
 */
export interface StructuredExchangeIssue {
  /** Stable machine-readable identifier for the rule that was broken. */
  rule: string;
  /** JSON Pointer to the offending value. */
  path: string;
  message: string;
  limit?: number;
  observed?: number;
  /** Which bound refused it: the schema's ceiling, or this deployment's own. */
  level?: "ceiling" | "deployment";
}

export type StructuredExchangeVerdict =
  | { valid: true; envelope: ValidatedStructuredExchange; issues: [] }
  | { valid: false; issues: StructuredExchangeIssue[] };

/** The data variant each kind must carry. */
function dataMatchesKind(envelope: StructuredExchangeEnvelope): boolean {
  const data = envelope.data as unknown as Record<string, unknown>;
  if (envelope.kind === "graph") return Array.isArray(data.nodes) && Array.isArray(data.edges);
  if (envelope.kind === "sequence") return Array.isArray(data.participants) && Array.isArray(data.messages);
  return Array.isArray(data.columns) && Array.isArray(data.rows);
}

/** The elements of a graph or a sequence, whichever this is. */
function elementsOf(envelope: StructuredExchangeEnvelope): StructuredElement[] {
  if (envelope.kind === "graph") return (envelope.data as StructuredGraphData).nodes;
  if (envelope.kind === "sequence") return (envelope.data as StructuredSequenceData).participants;
  return [];
}

/** The relationships of a graph or a sequence, as endpoint pairs with their refs. */
function relationshipsOf(envelope: StructuredExchangeEnvelope): { from: string; to: string; ref?: string; set?: object }[] {
  if (envelope.kind === "graph") return (envelope.data as StructuredGraphData).edges;
  if (envelope.kind === "sequence") return (envelope.data as StructuredSequenceData).messages;
  return [];
}

/** Where the elements live in the document, for pointing at them. */
function elementsPointer(envelope: StructuredExchangeEnvelope): string {
  return envelope.kind === "graph" ? "/data/nodes" : "/data/participants";
}

function relationshipsPointer(envelope: StructuredExchangeEnvelope): string {
  return envelope.kind === "graph" ? "/data/edges" : "/data/messages";
}

/**
 * Every relational rule, in one pass per rule so a document that breaks several
 * is told about all of them. A producer fixing one issue at a time and being
 * refused again for the next is a producer that gives up.
 */
export function validateStructuredExchangeSemantics(envelope: StructuredExchangeEnvelope): StructuredExchangeIssue[] {
  const issues: StructuredExchangeIssue[] = [];

  if (!dataMatchesKind(envelope)) {
    issues.push({
      rule: "kind-data-mismatch",
      path: "/data",
      message: `data does not carry what kind "${envelope.kind}" declares`,
    });
    // Every rule below reads the data through its kind; with the two disagreeing
    // there is nothing further that can be said honestly.
    return issues;
  }

  const proposable = PROPOSABLE_KINDS.includes(envelope.kind);
  if (envelope.target !== undefined && !proposable) {
    issues.push({
      rule: "kind-not-proposable",
      path: "/target",
      message: `a ${envelope.kind} is a projection and cannot be proposed, so it carries no target`,
    });
  }
  // Presence is the assertion, not length. An empty `removals` on a projection still
  // claims the document is a proposal, and a producer that sends one has misunderstood
  // the contract in a way worth telling them about rather than quietly tolerating.
  if (envelope.removals !== undefined) {
    if (!proposable) {
      issues.push({
        rule: "kind-not-proposable",
        path: "/removals",
        message: `a ${envelope.kind} is a projection and cannot be proposed, so it declares no removals`,
      });
    } else if (envelope.target === undefined) {
      issues.push({
        rule: "removal-without-target",
        path: "/removals",
        message: "removals need a target: an artifact that does not exist yet has nothing to remove",
      });
    }
  }

  const elements = elementsOf(envelope);
  const elementsAt = elementsPointer(envelope);

  // Unique envelope-scoped identifiers. Duplicates would make an endpoint
  // ambiguous, and picking one of them is exactly the kind of guess that is
  // forbidden here.
  const seenIds = new Map<string, number>();
  elements.forEach((element, index) => {
    const first = seenIds.get(element.id);
    if (first === undefined) seenIds.set(element.id, index);
    else {
      issues.push({
        rule: "duplicate-identifier",
        path: `${elementsAt}/${index}/id`,
        message: `identifier "${element.id}" is already declared at ${elementsAt}/${first}`,
      });
    }
  });

  // Endpoints resolve to something declared in this envelope — never to a ref,
  // which belongs to the external authority and means nothing locally.
  const relationshipsAt = relationshipsPointer(envelope);
  relationshipsOf(envelope).forEach((relationship, index) => {
    for (const side of ["from", "to"] as const) {
      const endpoint = relationship[side];
      if (!seenIds.has(endpoint)) {
        issues.push({
          rule: "unresolved-endpoint",
          path: `${relationshipsAt}/${index}/${side}`,
          message: `"${endpoint}" is not an identifier declared in ${elementsAt}`,
        });
      }
    }
  });

  // One intention per thing. Local identifiers are unique, but two elements may
  // still carry the *same* reference — two instructions about one thing in the
  // authority, with no way to say which wins. Removals count: a reference that is
  // both changed and removed is the same ambiguity spelled differently, and is
  // refused here rather than resolved by precedence.
  const claimed = new Map<string, string>();
  const claim = (type: "element" | "relationship", ref: string | undefined, at: string) => {
    if (ref === undefined) return;
    const key = `${type}:${ref}`;
    const first = claimed.get(key);
    if (first === undefined) claimed.set(key, at);
    else {
      issues.push({
        rule: "duplicate-reference",
        path: at,
        message: `${type} "${ref}" is already addressed at ${first}; a proposal states one intention per thing`,
      });
    }
  };
  elements.forEach((element, index) => claim("element", element.ref, `${elementsAt}/${index}`));
  relationshipsOf(envelope).forEach((relationship, index) => claim("relationship", relationship.ref, `${relationshipsAt}/${index}`));
  (envelope.removals ?? []).forEach((removal, index) => claim(removal.type, removal.ref, `/removals/${index}`));

  // A change has to have something to change. `set` without a `ref` names no
  // element the authority holds, and would be a creation wearing a patch's
  // clothes — refused rather than read as one or the other.
  const changeables: { at: string; ref?: string; set?: object }[] = [
    ...elements.map((element, index) => ({ at: `${elementsAt}/${index}`, ref: element.ref, set: element.set })),
    ...relationshipsOf(envelope).map((relationship, index) => ({
      at: `${relationshipsPointer(envelope)}/${index}`,
      ref: relationship.ref,
      set: relationship.set,
    })),
  ];
  for (const candidate of changeables) {
    if (candidate.set === undefined) continue;
    if (candidate.ref === undefined) {
      issues.push({
        rule: "change-without-reference",
        path: `${candidate.at}/set`,
        message: "a change names a reference to change; without one this is a new thing, and its fields are its values",
      });
    } else if (!proposable) {
      issues.push({
        rule: "kind-not-proposable",
        path: `${candidate.at}/set`,
        message: `a ${envelope.kind} is a projection and cannot be proposed, so nothing in it declares a change`,
      });
    } else if (envelope.target === undefined) {
      // `target` is the whole of what makes a document a proposal, and the reader's
      // rendering keys every "added"/"changed" mark off it. A `set` without one asks
      // an authority to mutate something while the envelope claims to describe a new
      // artifact, and it draws as an unremarkable box: a mutation nobody was shown.
      issues.push({
        rule: "change-without-target",
        path: `${candidate.at}/set`,
        message:
          "a change needs a target: naming what is being changed is what makes this a proposal rather than a new artifact",
      });
    }
  }

  /**
   * Distinct types, per vocabulary, counted independently.
   *
   * The ceiling is what a reader can be shown apart, not what fits in memory: types
   * are distinguished by a colour and a pattern, sixty-four combinations, and past
   * that two of them are drawn alike. A document a reader cannot check is not one to
   * accept quietly.
   */
  const countKinds = (things: { kind?: string }[]): Set<string> => {
    const seen = new Set<string>();
    for (const thing of things) if (thing.kind !== undefined && thing.kind !== "") seen.add(thing.kind);
    return seen;
  };
  const vocabularies: [string, string, Set<string>][] = [
    [envelope.kind === "sequence" ? "participant" : "element", elementsAt, countKinds(elements)],
    [
      envelope.kind === "sequence" ? "message" : "relationship",
      relationshipsPointer(envelope),
      countKinds(relationshipsOf(envelope) as { kind?: string }[]),
    ],
  ];
  for (const [noun, at, kinds] of vocabularies) {
    if (kinds.size > STRUCTURED_EXCHANGE_CEILINGS.kindsPerVocabulary) {
      issues.push({
        rule: "too-many-kinds",
        path: at,
        message: `${kinds.size} distinct ${noun} types, and no more than ${STRUCTURED_EXCHANGE_CEILINGS.kindsPerVocabulary} can be told apart in a rendering`,
        observed: kinds.size,
        limit: STRUCTURED_EXCHANGE_CEILINGS.kindsPerVocabulary,
      });
    }
  }

  // Rows align to the columns they declare. A short row is not padded and a long
  // one is not trimmed; either would invent data the producer did not send.
  if (envelope.kind === "table") {
    const { columns, rows } = envelope.data as StructuredTableData;
    rows.forEach((row, index) => {
      if (row.length !== columns.length) {
        issues.push({
          rule: "row-column-mismatch",
          path: `/data/rows/${index}`,
          message: `row has ${row.length} values but ${columns.length} columns are declared`,
          observed: row.length,
          limit: columns.length,
        });
      }
    });
  }

  return issues;
}
