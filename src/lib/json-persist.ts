import { useSyncExternalStore } from "react";

export interface ProjectData {
  tasks: unknown[];
  settings: Record<string, unknown>;
  lastSavedAt?: string;
}

let lastSavedAt: string | null = null;
let currentFileHandle: FileSystemFileHandle | null = null;
let openedAt: string | null = null;
const lastSavedListeners = new Set<() => void>();

function notifyLastSavedListeners() {
  lastSavedListeners.forEach((l) => l());
}

const subscribeLastSaved = (l: () => void) => {
  lastSavedListeners.add(l);
  return () => lastSavedListeners.delete(l);
};
const getLastSavedSnapshot = () => lastSavedAt;
const getLastSavedServerSnapshot = () => null;

export function useLastSavedAt(): string | null {
  return useSyncExternalStore(subscribeLastSaved, getLastSavedSnapshot, getLastSavedServerSnapshot);
}

export function autoSaveToLocalStorage(data: ProjectData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("gantt-project-auto", JSON.stringify(data));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function loadFromLocalStorage(): ProjectData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("gantt-project-auto");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectData;
    if (!Array.isArray(parsed.tasks)) parsed.tasks = [];
    if (typeof parsed.settings !== "object" || parsed.settings === null) parsed.settings = {};
    return parsed;
  } catch {
    return null;
  }
}

export function clearLocalStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("gantt-project-auto");
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim() || "Proyecto";
}

export async function openProjectFile(): Promise<ProjectData | null> {
  try {
    const [handle] = await (
      window as unknown as {
        showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]>;
      }
    ).showOpenFilePicker({
      types: [
        {
          description: "JSON del proyecto",
          accept: { "application/json": [".json"] },
        },
      ],
      multiple: false,
    });
    const file = await handle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text) as ProjectData;
    if (!Array.isArray(parsed.tasks)) parsed.tasks = [];
    if (typeof parsed.settings !== "object" || parsed.settings === null) parsed.settings = {};
    currentFileHandle = handle;
    openedAt = parsed.lastSavedAt ?? null;
    lastSavedAt = parsed.lastSavedAt ?? null;
    notifyLastSavedListeners();
    autoSaveToLocalStorage(parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function saveProjectFile(data: ProjectData, projectName: string): Promise<boolean> {
  const now = new Date().toISOString();
  const toSave: ProjectData = { ...data, lastSavedAt: now };
  const suggestedName = `Gantt-${sanitizeFilename(projectName)}.json`;
  const json = JSON.stringify(toSave, null, 2);

  try {
    const handle = await (
      window as unknown as {
        showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
      }
    ).showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: "JSON del proyecto",
          accept: { "application/json": [".json"] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    currentFileHandle = handle;
    openedAt = now;
    lastSavedAt = now;
    notifyLastSavedListeners();
    autoSaveToLocalStorage(toSave);
    return true;
  } catch {
    return false;
  }
}

export async function checkFileConflict(): Promise<boolean> {
  if (!currentFileHandle || !openedAt) return false;
  try {
    const file = await currentFileHandle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text) as ProjectData;
    return parsed.lastSavedAt !== openedAt;
  } catch {
    return false;
  }
}

export function clearFileState(): void {
  currentFileHandle = null;
  openedAt = null;
  lastSavedAt = null;
  notifyLastSavedListeners();
}
