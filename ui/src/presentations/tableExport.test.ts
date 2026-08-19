import { describe, it, expect } from "vitest";
import type { StructuredTableData } from "@pi-outpost/shared/structured-exchange";
import { filterKey } from "./structuredExchange";
import { tableExport, toCsv } from "./tableExport";

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
