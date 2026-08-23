import { describe, it, expect, vi, afterEach } from "vitest";
import type { StructuredTableData } from "@pi-outpost/shared/structured-exchange";
import { filterKey } from "./structuredExchange";
import { downloadCsv, tableExport, toCsv } from "./tableExport";

const roled: StructuredTableData = {
  columns: ["ID", "Requirement", "Weight"],
  rows: [
    { role: "added", cells: ["REQ-5", 'Log "every" actuation, always.', 12] },
    { role: "removed", cells: ["REQ-3", "Read battery voltage at 10 Hz.", 3] },
    { cells: ["REQ-1", "Stop within 40 m.", null] },
  ],
};

const plain: StructuredTableData = {
  columns: ["ID", "Status"],
  rows: [
    ["REQ-1", "approved"],
    ["REQ-2", "draft"],
  ],
};

const nothingHidden: ReadonlySet<string> = new Set();

describe("what an export carries", () => {
  it("adds a column for the role, since the colour cannot cross", () => {
    const exported = tableExport(roled, nothingHidden);
    expect(exported.columns).toEqual(["ID", "Requirement", "Weight", "change"]);
    expect(exported.rows.map((row) => row.at(-1))).toEqual(["added", "removed", "existing"]);
  });

  it("invents no column for a table that declares no role", () => {
    expect(tableExport(plain, nothingHidden).columns).toEqual(["ID", "Status"]);
    expect(tableExport(plain, nothingHidden).rows).toEqual([
      ["REQ-1", "approved"],
      ["REQ-2", "draft"],
    ]);
  });

  it("carries what is shown, and counts what it left behind", () => {
    const exported = tableExport(roled, new Set([filterKey("role", "removed")]));
    expect(exported.rows.map((row) => row[0])).toEqual(["REQ-5", "REQ-1"]);
    expect(exported.withheld).toBe(1);
  });
});

describe("comma-separated values", () => {
  it("quotes a value that would otherwise break the file apart", () => {
    const csv = toCsv(tableExport(roled, nothingHidden));
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("ID,Requirement,Weight,change");
    // A comma and a quote in one prose cell: written raw this is three fields
    expect(lines[1]).toBe('REQ-5,"Log ""every"" actuation, always.",12,added');
  });

  it("writes an empty field for a null, not the word", () => {
    const csv = toCsv(tableExport(roled, nothingHidden));
    expect(csv.split("\r\n").at(-1)).toBe("REQ-1,Stop within 40 m.,,existing");
  });

  it("keeps a newline inside a cell inside its own field", () => {
    const wrapped: StructuredTableData = { columns: ["note"], rows: [["one\ntwo"]] };
    expect(toCsv(tableExport(wrapped, nothingHidden))).toBe('note\r\n"one\ntwo"');
  });
});

/**
 * Handing the browser a file.
 *
 * The pure half above decides what an export contains; this half is what actually
 * reaches the reader's disk, and it was the untested half. Two things live here
 * that nothing else checks: the byte-order mark that is the difference between a
 * French requirement arriving intact and arriving mangled in Excel, and the cell
 * typing that is the difference between a spreadsheet and a picture of one.
 */
describe("handing the browser a file", () => {
  /** The anchor `save` builds, and the blob it was given. */
  function captureDownload() {
    const anchors: HTMLAnchorElement[] = [];
    const blobs: Blob[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string, ...rest: unknown[]) => {
      const element = realCreate(tag, ...(rest as []));
      if (tag === "a") {
        // The click navigates in a real browser and is "not implemented" in jsdom;
        // what matters is that it happened, on an anchor carrying this name.
        (element as HTMLAnchorElement).click = () => anchors.push(element as HTMLAnchorElement);
      }
      return element;
    });
    const revoked: string[] = [];
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return "blob:table";
      },
      revokeObjectURL: (url: string) => revoked.push(url),
    });
    return { anchors, blobs, revoked };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("saves the CSV under the name it was given, and lets the url go", async () => {
    const { anchors, blobs, revoked } = captureDownload();

    downloadCsv(tableExport(roled, nothingHidden), "requirements.csv");

    expect(anchors).toHaveLength(1);
    expect(anchors[0].download).toBe("requirements.csv");
    expect(anchors[0].href).toBe("blob:table");
    // Not leaked: a blob url held for the life of the page holds the file with it.
    expect(revoked).toEqual(["blob:table"]);
    expect(blobs[0].type).toBe("text/csv;charset=utf-8");
  });

  it("writes the byte-order mark Excel needs, ahead of the rows", async () => {
    // Without it Excel reads a UTF-8 file as the local code page, and a requirement
    // written in French arrives mangled. It has to be first, not merely present.
    const { blobs } = captureDownload();
    const accented: StructuredTableData = { columns: ["exigence"], rows: [["Arrêt en 40 m"]] };

    downloadCsv(tableExport(accented, nothingHidden), "fr.csv");

    // Read as bytes, not as text: `Blob.text()` decodes UTF-8 and strips a leading
    // BOM by specification, so a text assertion here passes whether or not the mark
    // was ever written — which is the one thing this test exists to check.
    const bytes = new Uint8Array(await blobs[0].arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(await blobs[0].text()).toContain("Arrêt en 40 m");
  });

  it("types a workbook's cells as what they are, so a number sorts as a number", async () => {
    // Asserted on what the writer is handed rather than on the bytes it produces:
    // the typing is this module's decision, and the workbook format is not.
    const handed: unknown[][] = [];
    vi.doMock("write-excel-file/browser", () => ({
      default: (rows: unknown[][]) => {
        handed.push(...rows);
        return { toBlob: async () => new Blob(["xlsx"]) };
      },
    }));
    const { anchors } = captureDownload();
    const mixed: StructuredTableData = {
      columns: ["ID", "Weight", "Signed", "Note"],
      rows: [["REQ-1", 12, true, null]],
    };

    const { downloadXlsx: freshDownloadXlsx } = await import("./tableExport");
    await freshDownloadXlsx(tableExport(mixed, nothingHidden), "requirements.xlsx");

    const [header, row] = handed as [{ value: string; fontWeight?: string }[], { value: unknown; type?: unknown }[]];
    expect(header.map((cell) => cell.value)).toEqual(["ID", "Weight", "Signed", "Note"]);
    expect(header.every((cell) => cell.fontWeight === "bold")).toBe(true);
    expect(row[0]).toEqual({ value: "REQ-1", type: String });
    expect(row[1]).toEqual({ value: 12, type: Number });
    expect(row[2]).toEqual({ value: true, type: Boolean });
    // A null is an empty cell, not the word "null" — which a spreadsheet would
    // otherwise sort and filter on as if somebody had written it.
    expect(row[3]).toEqual({ value: undefined });
    expect(anchors[0].download).toBe("requirements.xlsx");
    vi.doUnmock("write-excel-file/browser");
  });
});
