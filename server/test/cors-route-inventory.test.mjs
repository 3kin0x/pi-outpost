import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { HTTP_ROUTE_CASES, WEBSOCKET_ROUTE } from "./cors-route-cases.mjs";

// openlore: {"domain":"api","requirement":"CrossOriginResponses","scenario":"EveryRouteAnswersTheSameWay","specFile":"openspec/changes/add-cors-for-allowed-origins/specs/api/spec.md"}
describe("CORS route inventory", () => {
  test("every literal Fastify GET registration has a matching transport test", async () => {
    const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
    const registered = [...source.matchAll(/\bapp\.get\(\s*["'`]([^"'`]+)["'`]/g)].map((match) => match[1]).sort();
    const exercised = [...HTTP_ROUTE_CASES.map(({ registration }) => registration), WEBSOCKET_ROUTE].sort();

    assert.deepEqual(registered, exercised);
  });
});
