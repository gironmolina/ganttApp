import { useSyncExternalStore } from "react";

let dirty = false;
const listeners = new Set<() => void>();

export function markDirty() {
  dirty = true;
  listeners.forEach((l) => l());
}

export function markClean() {
  dirty = false;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => dirty;
const getServerSnapshot = () => false;

export function useIsDirty() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
