import { useSyncExternalStore } from "react";
import {
  autoSaveToLocalStorage,
  loadFromLocalStorage as loadAutoSave,
  type ProjectData,
} from "./json-persist";
import { markDirty } from "./dirty-store";

export interface ProjectSettings {
  name: string;
  startDate: string;
  endDate: string;
}

const STORAGE_KEY = "gantt-settings-v1";

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};

const defaults = (): ProjectSettings => ({
  name: "Planificador Gantt",
  startDate: today(),
  endDate: addDays(today(), 60),
});

function autosave(settings: ProjectSettings): void {
  const tasks = loadTasksForAutoSave();
  autoSaveToLocalStorage({ tasks, settings: { ...settings } });
}

function loadTasksForAutoSave(): unknown[] {
  try {
    const raw = localStorage.getItem("gantt-tasks-v3");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadAutoSavedSettings(): ProjectSettings | null {
  const data = loadAutoSave();
  if (!data) return null;
  return (data.settings as unknown as ProjectSettings) ?? null;
}

let settings: ProjectSettings = defaults();
let hydrated = false;
const listeners = new Set<() => void>();

function loadFromLocalStorage(): ProjectSettings {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    return defaults();
  }
}

function persist() {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }
  listeners.forEach((l) => l());
  autosave(settings);
  markDirty();
}

function ensureHydrated() {
  if (!hydrated && typeof window !== "undefined") {
    settings = loadFromLocalStorage();
    hydrated = true;
    const autoSettings = loadAutoSavedSettings();
    if (autoSettings) {
      settings = { ...defaults(), ...autoSettings };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      listeners.forEach((l) => l());
    } else {
      autosave(settings);
    }
  }
}

const subscribe = (l: () => void) => {
  ensureHydrated();
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => settings;
const SERVER_DEFAULTS = defaults();
const getServerSnapshot = () => SERVER_DEFAULTS;

export function useSettings() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const settingsStore = {
  loadProject(data: ProjectData) {
    const loaded = data.settings as unknown as ProjectSettings;
    settings = { ...defaults(), ...loaded };
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
    listeners.forEach((l) => l());
  },
  update(patch: Partial<ProjectSettings>) {
    settings = { ...settings, ...patch };
    if (settings.endDate < settings.startDate) settings.endDate = settings.startDate;
    persist();
  },
};
