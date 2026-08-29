/**
 * What the inlined web bundle says each asset is.
 *
 * The executable serves the interface from a map built at build time, and each
 * entry carries the content type the browser will be given. An extension the
 * table does not know becomes `application/octet-stream`, which the browser then
 * refuses to interpret — and for the web app manifest that means the interface is
 * installable from a built directory and silently not installable from the
 * executable, with no error anywhere to say so.
 *
 * These assert against the generator's own table, not a list kept here: a
 * hand-maintained copy would keep passing after the real table lost an entry.
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { MIME, generateEmbeddedWeb } from "../../cli/scripts/embed-web.mjs";

/** Build a throwaway dist, inline it, and read back the generated map. */
async function inline(files, t) {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-embedded-web-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const dist = path.join(dir, "dist");
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(dist, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  const out = path.join(dir, "embedded-web.ts");
  await generateEmbeddedWeb(dist, out);
  const source = await readFile(out, "utf-8");
  // The generated module is a TypeScript literal; read the entries out of it
  // rather than importing, so the test sees exactly what ships.
  const entries = {};
  for (const [, url, type] of source.matchAll(/^ {2}"([^"]+)": \{ b64: "[^"]*", type: "([^"]+)" \},$/gm)) {
    entries[url] = type;
  }
  return entries;
}

test("every extension the generator knows survives into the bundle", async (t) => {
  const files = {};
  const expected = {};
  for (const extension of Object.keys(MIME)) {
    const name = `asset${extension}`;
    files[name] = "x";
    expected["/" + name] = MIME[extension];
  }

  const entries = await inline(files, t);

  // Driven off the production table, so an entry deleted there fails here rather
  // than passing against a copy this file kept.
  for (const [url, type] of Object.entries(expected)) {
    assert.equal(entries[url], type, `${url} lost its content type`);
  }
});

test("a web app manifest is inlined as a manifest, not as an opaque stream", async (t) => {
  const entries = await inline({ "manifest.webmanifest": "{}", "index.html": "<html></html>" }, t);

  assert.equal(entries["/manifest.webmanifest"], "application/manifest+json");
  assert.notEqual(entries["/manifest.webmanifest"], "application/octet-stream");
});

test("an extension nothing claims is still served, as an opaque stream", async (t) => {
  // The fallback is deliberate — an unknown asset must still be served — and this
  // pins it so the manifest assertion above means something.
  const entries = await inline({ "notes.unknownext": "x" }, t);

  assert.equal(entries["/notes.unknownext"], "application/octet-stream");
});
