/**
 * Which declared entry answers for a model.
 *
 * The resolution rule on its own, away from a running server: provider-wide entries,
 * model-specific ones, and the precedence between them.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { declaredThinkingLevels } from "../src/config.ts";

const DECLARATIONS = [
  { provider: "maison", levels: ["off"] as const },
  { provider: "maison", id: "big", levels: ["off", "low", "medium"] as const },
  { provider: "other", id: "only-this-one", levels: ["off", "high"] as const },
];

const declared = (provider: string, id: string) =>
  declaredThinkingLevels(DECLARATIONS.map((entry) => ({ ...entry, levels: [...entry.levels] })), { provider, id });

// ---------------------------------------------------------------------------
describe("resolving a model's declared thinking levels", () => {
  // openlore: scenario=DeclaringAWholeProvider spec=config
  test("a provider-wide entry answers for any model of that provider", () => {
    assert.deepEqual(declared("maison", "anything-at-all"), ["off"]);
  });

  // openlore: scenario=TheMoreSpecificEntryWins spec=config
  test("an entry naming the model wins over the provider-wide one", () => {
    assert.deepEqual(declared("maison", "big"), ["off", "low", "medium"]);
  });

  test("an entry naming a model answers for that model alone", () => {
    assert.deepEqual(declared("other", "only-this-one"), ["off", "high"]);
    assert.equal(declared("other", "someone-else"), undefined);
  });

  // openlore: scenario=UnsetLeavesTheRuntimeInCharge spec=config
  test("nothing is declared for a provider nobody mentioned", () => {
    assert.equal(declared("builtin", "sonnet"), undefined);
  });

  test("nothing is declared when the deployment declares nothing at all", () => {
    assert.equal(declaredThinkingLevels(undefined, { provider: "maison", id: "big" }), undefined);
  });

  test("nothing is declared when there is no current model to declare it for", () => {
    assert.equal(declaredThinkingLevels([{ provider: "maison", levels: ["off"] }], undefined), undefined);
  });
});
