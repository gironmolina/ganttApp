import { useSyncExternalStore } from "react";
import { getProjectData, mergeProjectData } from "./json-persist";

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

async function saveToServer(settings: ProjectSettings): Promise<void> {
  try {
    await mergeProjectData({ data: { settings } });
  } catch {
    /* network error — ignore */
  }
}

async function loadFromServer(): Promise<ProjectSettings | null> {
  try {
    const data = await getProjectData();
    if (!data) return null;
    return (data.settings as unknown as ProjectSettings) ?? null;
  } catch {
    return null;
  }
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
  saveToServer(settings);
}

function ensureHydrated() {
  if (!hydrated && typeof window !== "undefined") {
    settings = loadFromLocalStorage();
    hydrated = true;
    loadFromServer().then((serverSettings) => {
      if (serverSettings) {
        settings = { ...defaults(), ...serverSettings };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        listeners.forEach((l) => l());
      } else {
        saveToServer(settings);
      }
    });
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
  update(patch: Partial<ProjectSettings>) {
    settings = { ...settings, ...patch };
    if (settings.endDate < settings.startDate) settings.endDate = settings.startDate;
    persist();
  },
};
