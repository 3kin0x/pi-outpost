import { describe, expect, it, vi } from "vitest";
import {
  clampPanelWidth,
  FILES_SIDEBAR_WIDTH,
  HISTORY_LIST_WIDTH,
  parsePanelWidth,
  readPanelWidth,
  writePanelWidth,
} from "./panelWidth";

describe("resizable panel width", () => {
  it("uses the panel default for missing, blank, malformed, and non-finite values", () => {
    expect(parsePanelWidth(null, FILES_SIDEBAR_WIDTH)).toBe(288);
    expect(parsePanelWidth(" ", FILES_SIDEBAR_WIDTH)).toBe(288);
    expect(parsePanelWidth("wide", HISTORY_LIST_WIDTH)).toBe(416);
    expect(parsePanelWidth("Infinity", HISTORY_LIST_WIDTH)).toBe(416);
  });

  it("normalizes finite values to bounded integer pixels", () => {
    expect(clampPanelWidth(320.6, FILES_SIDEBAR_WIDTH)).toBe(321);
    expect(clampPanelWidth(100, FILES_SIDEBAR_WIDTH)).toBe(224);
    expect(clampPanelWidth(900, FILES_SIDEBAR_WIDTH)).toBe(640);
  });

  it("reads and writes each namespaced preference", () => {
    const reader = { getItem: vi.fn().mockReturnValue("352") };
    const writer = { setItem: vi.fn() };

    expect(readPanelWidth(HISTORY_LIST_WIDTH, reader)).toBe(352);
    expect(reader.getItem).toHaveBeenCalledWith(HISTORY_LIST_WIDTH.storageKey);
    writePanelWidth(352.4, HISTORY_LIST_WIDTH, writer);
    expect(writer.setItem).toHaveBeenCalledWith(HISTORY_LIST_WIDTH.storageKey, "352");
  });

  it("falls back safely when storage access is denied", () => {
    const deniedReader = { getItem: vi.fn(() => { throw new Error("denied"); }) };
    const deniedWriter = { setItem: vi.fn(() => { throw new Error("denied"); }) };

    expect(readPanelWidth(FILES_SIDEBAR_WIDTH, deniedReader)).toBe(288);
    expect(() => writePanelWidth(352, FILES_SIDEBAR_WIDTH, deniedWriter)).not.toThrow();
  });
});
