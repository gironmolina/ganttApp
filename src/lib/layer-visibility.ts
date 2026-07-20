import { useSyncExternalStore } from "react";

export type LayerKey =
  | "onTrack"
  | "completed"
  | "initial"
  | "estimated"
  | "partialBlock"
  | "totalBlock"
  | "delayed"
  | "startDelay"
  | "overtime"
  | "dependencies"
  | "criticalPath";

const STORAGE_KEY = "gantt-layer-visibility";

const defaults: Record<LayerKey, boolean> = {
  onTrack: true,
  completed: true,
  initial: true,
  estimated: true,
  partialBlock: true,
  totalBlock: true,
  delayed: true,
  startDelay: true,
  overtime: true,
  dependencies: true,
  criticalPath: false,
};

function load(): Record<LayerKey, boolean> {
  if (typeof window === "undefined") return { ...defaults };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

let visibility: Record<LayerKey, boolean> = load();
const listeners = new Set<() => void>();

function persist() {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility));
  }
  listeners.forEach((l) => l());
}

export function toggleLayer(key: LayerKey) {
  visibility = { ...visibility, [key]: !visibility[key] };
  persist();
}

export function getLayerVisibility(): Record<LayerKey, boolean> {
  return visibility;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => visibility;
const getServerSnapshot = () => defaults;

export function useLayerVisibility(): Record<LayerKey, boolean> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
