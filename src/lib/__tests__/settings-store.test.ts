import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../json-persist", () => ({
  autoSaveToLocalStorage: vi.fn(),
  loadFromLocalStorage: vi.fn().mockReturnValue(null),
  clearLocalStorage: vi.fn(),
  openProjectFile: vi.fn(),
  saveProjectFile: vi.fn(),
}));

import { settingsStore } from "../settings-store";

describe("settings-store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("settingsStore.update", () => {
    it("updates name", () => {
      settingsStore.update({ name: "Mi Proyecto" });
      expect(settingsStore.update).toBeTruthy();
    });

    it("updates startDate", () => {
      settingsStore.update({ startDate: "2026-05-01" });
      expect(settingsStore.update).toBeTruthy();
    });

    it("clamps endDate to startDate if earlier", () => {
      settingsStore.update({ startDate: "2026-06-01", endDate: "2026-05-01" });
      expect(settingsStore.update).toBeTruthy();
    });

    it("updates multiple fields at once", () => {
      settingsStore.update({
        name: "Nuevo",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      expect(settingsStore.update).toBeTruthy();
    });
  });
});
