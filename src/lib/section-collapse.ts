import { useSyncExternalStore } from "react";

export type SectionKey = "fechas" | "dependencias" | "bloqueos" | "comentarios";

const STORAGE_KEY = "gantt-collapsed-sections";

function load(): Set<SectionKey> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set<SectionKey>(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

let collapsed: Set<SectionKey> = load();
const listeners = new Set<() => void>();

function persist() {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
  }
  listeners.forEach((l) => l());
}

export function toggleSection(id: SectionKey) {
  const next = new Set(collapsed);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed = next;
  persist();
}

export function isSectionCollapsed(id: SectionKey): boolean {
  return collapsed.has(id);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => collapsed;
const getServerSnapshot = () => new Set<SectionKey>();

export function useCollapsedSections(): Set<SectionKey> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
