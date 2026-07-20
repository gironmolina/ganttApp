import { useSyncExternalStore } from "react";

export interface ProjectData {
  tasks: unknown[];
  settings: Record<string, unknown>;
  lastSavedAt?: string;
}

let lastSavedAt: string | null = null;
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

function hasFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

function parseProjectData(raw: unknown): ProjectData {
  const parsed = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (!Array.isArray(parsed.tasks)) parsed.tasks = [];
  if (typeof parsed.settings !== "object" || parsed.settings === null) parsed.settings = {};
  return parsed as unknown as ProjectData;
}

export async function openProjectFile(): Promise<ProjectData | null> {
  if (hasFileSystemAccess()) {
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
      const parsed = parseProjectData(JSON.parse(text));
      lastSavedAt = parsed.lastSavedAt ?? null;
      notifyLastSavedListeners();
      autoSaveToLocalStorage(parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.style.display = "none";
    document.body.appendChild(input);

    input.onchange = async () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const text = await file.text();
        const parsed = parseProjectData(JSON.parse(text));
        lastSavedAt = parsed.lastSavedAt ?? null;
        notifyLastSavedListeners();
        autoSaveToLocalStorage(parsed);
        resolve(parsed);
      } catch {
        resolve(null);
      }
    };

    input.oncancel = () => {
      document.body.removeChild(input);
      resolve(null);
    };

    input.click();
  });
}

export async function saveProjectFile(data: ProjectData, projectName: string): Promise<boolean> {
  const now = new Date().toISOString();
  const toSave: ProjectData = { ...data, lastSavedAt: now };
  const suggestedName = `Gantt-${sanitizeFilename(projectName)}.json`;
  const json = JSON.stringify(toSave, null, 2);

  if (hasFileSystemAccess()) {
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
      lastSavedAt = now;
      notifyLastSavedListeners();
      autoSaveToLocalStorage(toSave);
      return true;
    } catch {
      return false;
    }
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  lastSavedAt = now;
  notifyLastSavedListeners();
  autoSaveToLocalStorage(toSave);
  return true;
}

export function clearFileState(): void {
  lastSavedAt = null;
  notifyLastSavedListeners();
}
