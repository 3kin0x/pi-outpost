/**
 * Builds the .pptx fixtures the presentation extraction tests read.
 *
 * Written by hand, like the .docx and .xlsx ones and for the same reason: the
 * tests need packages whose markup is exactly what we say it is — a deck whose
 * running order disagrees with its file numbering, a relationship target that
 * really points out of the package, a table that really declares three columns.
 *
 * The zip is written here too (deflated entries) so this script needs nothing
 * installed either.
 *
 *   node server/test/fixtures/make-pptx.mjs
 */
import { deflateRawSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const SLIDE_TYPE = `${R_NS}/slide`;

/** A zip written by hand: deflated entries, local headers, central directory. */
function zip(entries) {
  const files = [];
  const chunks = [];
  let offset = 0;

  for (const [name, content] of Object.entries(entries)) {
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const body = deflateRawSync(raw);
    const nameBytes = Buffer.from(name, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);

    chunks.push(local, nameBytes, body);
    files.push({ name: nameBytes, crc: crc32(raw), compressed: body.length, raw: raw.length, offset });
    offset += local.length + nameBytes.length + body.length;
  }

  const directoryOffset = offset;
  for (const file of files) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(file.crc, 16);
    central.writeUInt32LE(file.compressed, 20);
    central.writeUInt32LE(file.raw, 24);
    central.writeUInt16LE(file.name.length, 28);
    central.writeUInt32LE(file.offset, 42);
    chunks.push(central, file.name);
    offset += central.length + file.name.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(offset - directoryOffset, 12);
  eocd.writeUInt32LE(directoryOffset, 16);
  chunks.push(eocd);

  return Buffer.concat(chunks);
}

/* ── Markup helpers ─────────────────────────────────────────────────────────── */

const contentTypes = (slideParts) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${slideParts
    .map(
      (part) =>
        `<Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
    .join("\n  ")}
</Types>`;

/** `ppt/presentation.xml` listing the given relationship ids, in running order. */
const presentation = (relationshipIds) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="${P_NS}" xmlns:r="${R_NS}">
  <p:sldIdLst>${relationshipIds
    .map((rId, i) => `<p:sldId id="${256 + i}" r:id="${rId}"/>`)
    .join("")}</p:sldIdLst>
</p:presentation>`;

/** `ppt/_rels/presentation.xml.rels` — id → target, relative to `ppt/`. */
const presentationRels = (targetsById) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${Object.entries(targetsById)
    .map(([id, target]) => `<Relationship Id="${id}" Type="${SLIDE_TYPE}" Target="${target}"/>`)
    .join("\n  ")}
</Relationships>`;

const slide = (shapes) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="${A_NS}" xmlns:p="${P_NS}" xmlns:r="${R_NS}">
  <p:cSld><p:spTree>${shapes}</p:spTree></p:cSld>
</p:sld>`;

const paragraph = (text) => `<a:p><a:r><a:t>${text}</a:t></a:r></a:p>`;

/** A text shape; `placeholder` declares it as the slide's title when given. */
const textShape = (lines, placeholder) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Shape name that is not content"/><p:nvPr>` +
  `${placeholder ? `<p:ph type="${placeholder}"/>` : ""}</p:nvPr></p:nvSpPr>` +
  `<p:txBody>${lines.map(paragraph).join("")}</p:txBody></p:sp>`;

const tableCell = (text) => `<a:tc><a:txBody>${paragraph(text)}</a:txBody></a:tc>`;
const tableRow = (cells) => `<a:tr>${cells.map(tableCell).join("")}</a:tr>`;
const tableFrame = (rows) =>
  `<p:graphicFrame><a:graphic><a:graphicData uri="${A_NS.replace("/main", "")}/table">` +
  `<a:tbl>${rows.map(tableRow).join("")}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;

const picture = () => `<p:pic><p:blipFill><a:blip r:embed="rId9"/></p:blipFill></p:pic>`;
const chartFrame = () =>
  `<p:graphicFrame><a:graphic><a:graphicData uri="${A_NS.replace("/main", "")}/chart"/></a:graphic></p:graphicFrame>`;

/** A package from slides given in running order, plus optional overrides. */
function deck(slides, { targets, extra = {} } = {}) {
  const parts = {};
  const relTargets = {};
  slides.forEach((markup, i) => {
    const part = `ppt/slides/slide${i + 1}.xml`;
    parts[part] = markup;
    relTargets[`rId${i + 1}`] = `slides/slide${i + 1}.xml`;
  });
  const resolved = targets ?? relTargets;
  return zip({
    "[Content_Types].xml": contentTypes(Object.keys(parts)),
    "ppt/presentation.xml": presentation(Object.keys(resolved)),
    "ppt/_rels/presentation.xml.rels": presentationRels(resolved),
    ...parts,
    ...extra,
  });
}

const TABLE_ROWS = [
  ["Region", "Units", "Revenue"],
  ["North", "1200", "48000"],
  ["South", "900", "36500"],
];

const fixtures = {};

// Running order disagrees with file numbering: rId1 is slide3.xml. A reader that
// sorts file names returns these three slides backwards.
fixtures["pptx-order.pptx"] = deck(
  [slide(textShape(["First in the file"])), slide(textShape(["Second in the file"])), slide(textShape(["Third in the file"]))],
  {
    targets: {
      rId1: "slides/slide3.xml",
      rId2: "slides/slide1.xml",
      rId3: "slides/slide2.xml",
    },
  },
);

// A title placeholder, body text, and a table — in that declared order
fixtures["pptx-mixed.pptx"] = deck([
  slide(
    textShape(["Sales by region"], "title") +
      textShape(["The table below breaks the quarter down.", "Figures are provisional."]) +
      tableFrame(TABLE_ROWS),
  ),
  slide(textShape(["Outlook"], "ctrTitle") + textShape(["The second half depends on the supply chain."])),
]);

// A cell carrying the two characters that can break a markdown table
fixtures["pptx-escapes.pptx"] = deck([
  slide(
    tableFrame([
      ["Header | one", "Header two"],
      ["a | b", "back\\slash"],
    ]),
  ),
]);

// A slide whose only content is an image and a chart
fixtures["pptx-visual.pptx"] = deck([slide(picture() + chartFrame())]);

// Long enough to exercise the slide and character caps
fixtures["pptx-long.pptx"] = deck(
  Array.from({ length: 80 }, (_, i) => slide(textShape([`Slide number ${i + 1} of the long deck.`], "title"))),
);

// A relationship pointing out of the package: refused rather than read
fixtures["pptx-escaping-rel.pptx"] = deck([slide(textShape(["Unreachable"]))], {
  targets: { rId1: "../../../etc/passwd" },
});

// A relationship pointing at a part the archive does not carry
fixtures["pptx-missing-part.pptx"] = deck([slide(textShape(["Present"]))], {
  targets: { rId1: "slides/slide1.xml", rId2: "slides/slide404.xml" },
});

// A presentation that declares no slides at all
fixtures["pptx-no-slides.pptx"] = zip({
  "[Content_Types].xml": contentTypes([]),
  "ppt/presentation.xml": presentation([]),
  "ppt/_rels/presentation.xml.rels": presentationRels({}),
});

// A zip that is not an Office package
fixtures["pptx-not-office.pptx"] = zip({ "readme.txt": "just a zip" });

// An Office package that is not a presentation
fixtures["pptx-no-presentation.pptx"] = zip({
  "[Content_Types].xml": contentTypes([]),
  "word/document.xml": "<w:document/>",
});

// Not a zip at all
fixtures["pptx-corrupt.pptx"] = Buffer.from("PK this is not really a zip", "utf8");

// An OLE compound file, which is what an encrypted .pptx actually is
fixtures["pptx-encrypted.pptx"] = Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.alloc(64),
]);

// A compression bomb: one slide part that expands far beyond its stored size
fixtures["pptx-bomb.pptx"] = deck([slide(textShape(["x".repeat(200 * 1024 * 1024)]))]);

// More entries than the reader will look at, each one tiny: the entry count is a
// budget of its own, spent before a single part is inflated.
{
  const media = {};
  for (let i = 0; i < 2100; i++) media[`ppt/media/image${i}.png`] = `not really a png ${i}`;
  fixtures["pptx-many-entries.pptx"] = deck([slide(textShape(["Buried"]))], { extra: media });
}

for (const [name, bytes] of Object.entries(fixtures)) {
  await writeFile(path.join(HERE, name), bytes);
  console.log(`${name}: ${bytes.length} bytes`);
}
