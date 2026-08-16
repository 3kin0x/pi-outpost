/**
 * The Node-side schema check: full diagnostics, no size budget.
 *
 * Used by the server and by the reference command-line interface — the two places
 * where someone is going to have to act on a refusal. The browser gets a smaller
 * check generated from the same schema; see the build step for that one.
 *
 * Carries the whole compiler, so it is Node-only by weight rather than by API —
 * the browser gets a generated check instead.
 */
import { Compile } from "typebox/compile";
// Imported, not read from disk. The runtime has to validate against its committed
// copy wherever it is deployed, and this product ships as a bundle: a path
// relative to this module resolves inside the repository and nowhere else, so a
// filesystem read works in every test and fails on the first real install.
import schema from "../schemas/structured-exchange-1.json" with { type: "json" };
import type { StructuredExchangeSchemaCheck } from "./structuredExchangeParse.ts";
import type { StructuredExchangeIssue } from "./structuredExchangeValidation.ts";

/** The committed schema itself, bundled with the code that validates against it. */
export const STRUCTURED_EXCHANGE_SCHEMA: unknown = schema;

/**
 * Compiled once. The compiler is the expensive part; the check it produces is
 * not, and every document pays only for the check.
 */
let compiled: ReturnType<typeof Compile> | undefined;

function validator(): ReturnType<typeof Compile> {
  if (compiled === undefined) {
    // The committed copy, never fetched: validation must not depend on the network
    // being there or on what is at the other end of it.
    compiled = Compile(schema);
  }
  return compiled;
}

/**
 * TypeBox reports `params.limit` for the bound keywords, which is exactly what a
 * refusal has to carry to be actionable — the limit that applied, alongside the
 * value that broke it.
 */
function observedFor(keyword: string, value: unknown): number | undefined {
  if (typeof value === "string" && (keyword === "maxLength" || keyword === "minLength")) return value.length;
  if (Array.isArray(value) && (keyword === "maxItems" || keyword === "minItems")) return value.length;
  return undefined;
}

/** Reads a JSON Pointer out of the document, for the observed value in a diagnostic. */
function at(document: unknown, pointer: string): unknown {
  if (pointer === "") return document;
  let current: unknown = document;
  for (const rawSegment of pointer.slice(1).split("/")) {
    if (current === null || typeof current !== "object") return undefined;
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export const checkStructuredExchangeSchema: StructuredExchangeSchemaCheck = (document) => {
  const issues: StructuredExchangeIssue[] = [];
  for (const error of validator().Errors(document)) {
    const keyword = String(error.keyword ?? "schema");
    const limit = (error.params as { limit?: number } | undefined)?.limit;
    issues.push({
      rule: `schema/${keyword}`,
      path: error.instancePath ?? "",
      message: error.message ?? "does not conform to the published schema",
      ...(limit !== undefined ? { limit, level: "ceiling" as const } : {}),
      ...(() => {
        const observed = observedFor(keyword, at(document, error.instancePath ?? ""));
        return observed === undefined ? {} : { observed };
      })(),
    });
  }
  return issues;
};
