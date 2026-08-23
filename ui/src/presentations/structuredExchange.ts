/**
 * Reading a tool result's structured payload, in a browser.
 *
 * What an envelope *means* — roles, changes, labels, layout, the narrowing keys —
 * moved to `@pi-outpost/shared/structured-exchange/model`, so that a figure produced
 * without a browser is the same picture a reader sees rather than a second
 * implementation of it. This module is what stayed behind: validation, which needs a
 * schema check the environment chooses, and which here is the browser's.
 *
 * The model is re-exported so that every call site keeps importing from one place.
 */
import {
  parseSerializedStructuredExchange,
  type StructuredExchangeVerdict,
} from "@pi-outpost/shared/structured-exchange/parse";
import { checkStructuredExchangeSchemaInBrowser } from "@pi-outpost/shared/structured-exchange/schema-browser";
import {
  readStructuredExchangeDocument,
  type StructuredExchangeDocumentVerdict,
} from "@pi-outpost/shared/structured-exchange/document";
import type { ValidatedStructuredExchange } from "@pi-outpost/shared/structured-exchange";

export * from "@pi-outpost/shared/structured-exchange/model";

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
 * The verdict on a *file*'s content — a document opened in the viewer rather than
 * a payload attached to a tool result.
 *
 * Distinguishes "not one of ours" from "a version we do not implement" from
 * "declares the schema and fails it", which a boolean could not: the first two
 * are shown as the text they are, and only the third is anybody's mistake.
 */
export function readStructuredExchangeFile(content: string): StructuredExchangeDocumentVerdict {
  return readStructuredExchangeDocument(content, checkStructuredExchangeSchemaInBrowser);
}

export type { StructuredExchangeDocumentVerdict };
