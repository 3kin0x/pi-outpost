/**
 * The two pieces of OOXML packaging every Office reader here needs: the
 * relationship table, and the part name a relationship target denotes.
 *
 * Shared rather than copied. The spreadsheet reader owned this alone until the
 * presentation reader needed the same indirection — `<p:sldId r:id="rId2">` says
 * no more about which file holds the slide than `<sheet r:id="rId3">` says about
 * the sheet. Only the base part differs (`xl/` against `ppt/`), so that is the
 * parameter.
 *
 * SECURITY: a target is a name inside the package, never a filesystem path. It is
 * normalised here — `..` popped, `.` dropped — so a caller can compare the result
 * against the prefix it will accept. Nothing in this module touches the disk.
 */
import { scanXml } from "./xml.ts";

/**
 * A relationship target as a package part name. Targets are relative to the part
 * that declares them, so a base is required; a target starting with `/` is
 * absolute within the package and ignores it. This is name arithmetic, not path
 * resolution — `..` walking above the package root simply runs out of segments.
 */
export function resolvePart(target: string, base: string): string {
  const raw = target.startsWith("/") ? target.slice(1) : `${base}/${target}`;
  const segments: string[] = [];
  for (const segment of raw.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

/**
 * Relationship id → part name, from a `_rels/*.rels` part.
 *
 * The indirection matters: assuming `slideN.xml` or `sheetN.xml` matches the Nth
 * element is wrong on any package whose parts have been reordered or deleted. It
 * is the kind of assumption that holds on every fixture one would write by hand.
 */
export function parseRelationships(xml: string, base: string): Map<string, string> {
  const targets = new Map<string, string>();
  scanXml(xml, (event) => {
    if (event.kind !== "open") return;
    if (event.name !== "Relationship" && !event.name.endsWith(":Relationship")) return;
    const id = event.attributes.Id;
    const target = event.attributes.Target;
    if (id !== undefined && target !== undefined) targets.set(id, resolvePart(target, base));
  });
  return targets;
}
