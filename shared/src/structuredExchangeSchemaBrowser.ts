/**
 * The browser's schema check.
 *
 * A verdict, not a diagnosis. Everyone who has to act on a refusal reads it from
 * the command-line interface or the server, both of which run in Node with the
 * full validator; what the browser decides is only whether to render or fall
 * back. That distinction is worth about 22 KB gzipped, and buys a check that is
 * still generated from the published schema rather than written from it by hand.
 */
import { Check } from "./generated/structuredExchangeCheck.ts";
import type { StructuredExchangeSchemaCheck } from "./structuredExchangeParse.ts";

export const checkStructuredExchangeSchemaInBrowser: StructuredExchangeSchemaCheck = (document) => {
  if (Check(document)) return [];
  // One issue, deliberately unspecific: this check knows *that* the document does
  // not conform, and claiming to know *why* would be inventing detail it does not
  // have. The precise reason is available from the reference validator.
  return [
    {
      rule: "schema/invalid",
      path: "",
      message: "does not conform to the published structured-exchange schema",
    },
  ];
};
