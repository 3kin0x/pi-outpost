/**
 * Renders the installed app's icons from `public/favicon.svg`.
 *
 * Run by hand, not by the build. The icons change only when the artwork does,
 * and the build already has four stages before a bench can run — a fifth that
 * re-renders identical bytes on every install would earn nothing.
 *
 *   node web/scripts/generate-icons.mjs
 *
 * Needs `sharp`, which is deliberately not a declared dependency: nothing shipped
 * imports it, and declaring it would pull a native module into every install and
 * every CI run to serve a script that is run when the artwork changes. Install it
 * for the occasion instead:
 *
 *   npm install --no-save sharp && node web/scripts/generate-icons.mjs
 *
 * Two shapes come out, because platforms ask for two different things:
 *
 *  - `icon-<size>.png` — the artwork on transparency, shown as-is.
 *  - `icon-maskable-512.png` — the artwork on an opaque field, inset so it fits
 *    the maskable safe zone: a circle 80% of the icon's width. A square subject
 *    inscribed in that circle can be at most 80/√2 ≈ 56% of the width, so the
 *    glyph is drawn at 55% and centred. Anything larger is cut into by a platform
 *    that crops to a circle, and the cropping is what makes it look broken rather
 *    than small.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Imported here rather than at the top so a missing module says what to do. */
async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    console.error(
      "[icons] sharp is not installed. It is not a dependency of this repository —\n" +
        "        install it for the occasion:  npm install --no-save sharp",
    );
    process.exit(1);
  }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, "..", "public");
const SOURCE = path.join(PUBLIC, "favicon.svg");

/** The field a maskable icon is cropped out of: opaque, or the crop shows through. */
const MASKABLE_BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };
/** Fraction of the canvas the artwork may occupy inside the safe zone. */
const SAFE_FRACTION = 0.55;

const sharp = await loadSharp();
const svg = await readFile(SOURCE);

async function transparentIcon(size) {
  const png = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await writeFile(path.join(PUBLIC, `icon-${size}.png`), png);
  return `icon-${size}.png`;
}

async function maskableIcon(size) {
  const inner = Math.round(size * SAFE_FRACTION);
  const artwork = await sharp(svg, { density: 384 })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const png = await sharp({
    create: { width: size, height: size, channels: 4, background: MASKABLE_BACKGROUND },
  })
    .composite([{ input: artwork, gravity: "centre" }])
    .png()
    .toBuffer();
  await writeFile(path.join(PUBLIC, `icon-maskable-${size}.png`), png);
  return `icon-maskable-${size}.png`;
}

await mkdir(PUBLIC, { recursive: true });
const written = [await transparentIcon(192), await transparentIcon(512), await maskableIcon(512)];
console.log(`[icons] wrote ${written.join(", ")} to ${path.relative(process.cwd(), PUBLIC)}`);
