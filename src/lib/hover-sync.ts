import { useSyncExternalStore } from "react";

let current: string | null = null;
const listeners = new Set<() => void>();

export function setHoveredTask(id: string | null) {
  if (id === current) return;
  if (current !== null) {
    document
      .querySelectorAll(`[data-row-id="${CSS.escape(current)}"]`)
      .forEach((el) => el.classList.remove("row-hovered"));
  }
  current = id;
  if (id !== null) {
    document
      .querySelectorAll(`[data-row-id="${CSS.escape(id)}"]`)
      .forEach((el) => el.classList.add("row-hovered"));
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => current;
const getServerSnapshot = () => null;

/** Id de la tarea actualmente en hover (fila izquierda o barra del Gantt), reactivo. */
export function useHoveredTask(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
