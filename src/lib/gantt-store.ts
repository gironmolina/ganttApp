import { useSyncExternalStore } from "react";
import {
  autoSaveToLocalStorage,
  loadFromLocalStorage as loadAutoSave,
  type ProjectData,
} from "./json-persist";
import { markDirty } from "./dirty-store";

export type BlockType = "partial" | "total";
export type Priority = "high" | "medium" | "low" | "none";
export type DependencyType = "FS" | "FF" | "SF" | "SS";

export interface BlockRange {
  id: string;
  type: BlockType;
  reason?: string;
  startDate: string;
  endDate: string;
}

export interface Dependency {
  id: string;
  /** id de la tarea de la que depende esta (el predecesor). */
  predecessorId: string;
  type: DependencyType;
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface Task {
  id: string;
  parentId: string | null;
  position: number;
  title: string;
  assignee: string;
  priority: Priority;
  initialStartDate?: string;
  initialEndDate?: string;
  estimatedStartDate?: string;
  estimatedEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  progress: number;
  blocks: BlockRange[];
  dependencies: Dependency[];
  comments: Comment[];
  createdAt: string;
}

const STORAGE_KEY = "gantt-tasks-v5";

const uid = () => Math.random().toString(36).slice(2, 10);

const today = () => new Date().toISOString().slice(0, 10);

function autosave(tasks: Task[]): void {
  const settings = typeof window !== "undefined" ? loadSettingsForAutoSave() : {};
  autoSaveToLocalStorage({ tasks, settings });
}

function loadSettingsForAutoSave(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem("gantt-settings-v1");
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function loadAutoSavedProject(): Task[] | null {
  const data = loadAutoSave();
  if (!data) return null;
  return Array.isArray(data.tasks) ? (data.tasks as Task[]) : null;
}

function ensurePositions(taskList: Task[]): Task[] {
  const needsFix = taskList.some((t) => t.position === undefined || t.position === null);
  if (!needsFix) return taskList;
  const byParent = new Map<string | null, Task[]>();
  for (const t of taskList) {
    const arr = byParent.get(t.parentId) ?? [];
    arr.push(t);
    byParent.set(t.parentId, arr);
  }
  for (const arr of byParent.values())
    arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title));
  const positionMap = new Map<string, number>();
  for (const arr of byParent.values()) arr.forEach((t, i) => positionMap.set(t.id, i));
  return taskList.map((t) => ({ ...t, position: positionMap.get(t.id) ?? 0 }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateTasks(taskList: any[]): Task[] {
  return taskList.map((t) => {
    let migrated = { ...t };

    // v1 -> v2: startDate/endDate -> initialStartDate/initialEndDate
    if (t.startDate !== undefined && t.initialStartDate === undefined) {
      const { startDate, endDate, ...rest } = migrated;
      migrated = {
        ...rest,
        initialStartDate: startDate || undefined,
        initialEndDate: endDate || undefined,
      };
    }

    // v2 -> v3: block + blockReason -> blocks array
    if (t.blocks === undefined && t.block !== undefined) {
      const rangeStart =
        migrated.estimatedStartDate || migrated.initialStartDate || migrated.startDate;
      const rangeEnd = migrated.estimatedEndDate || migrated.initialEndDate || migrated.endDate;
      if (t.block !== "none" && rangeStart && rangeEnd) {
        migrated.blocks = [
          {
            id: uid(),
            type: t.block,
            reason: t.blockReason || undefined,
            startDate: rangeStart,
            endDate: rangeEnd,
          },
        ];
      } else {
        migrated.blocks = [];
      }
      delete migrated.block;
      delete migrated.blockReason;
    }

    if (!migrated.blocks) {
      migrated.blocks = [];
    }

    // v4 -> v5: dependencias entre tareas
    if (!migrated.dependencies) {
      migrated.dependencies = [];
    }

    if (!migrated.priority) {
      migrated.priority = "none";
    }

    return migrated as Task;
  });
}

function loadFromLocalStorage(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem("gantt-tasks-v4");
    }
    if (!raw) {
      raw = localStorage.getItem("gantt-tasks-v3");
    }
    if (!raw) {
      return [];
    }
    return ensurePositions(migrateTasks(JSON.parse(raw)));
  } catch {
    return [];
  }
}

let tasks: Task[] = [];
let hydrated = false;
const listeners = new Set<() => void>();
const EMPTY_TASKS: Task[] = [];

function persist() {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }
  listeners.forEach((l) => l());
  autosave(tasks);
  markDirty();
}

function ensureHydrated() {
  if (!hydrated && typeof window !== "undefined") {
    tasks = loadFromLocalStorage();
    hydrated = true;
    const autoTasks = loadAutoSavedProject();
    if (autoTasks !== null) {
      tasks = migrateTasks(autoTasks);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      listeners.forEach((l) => l());
    } else {
      autosave(tasks);
    }
  }
}

const subscribe = (l: () => void) => {
  ensureHydrated();
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => tasks;
const getServerSnapshot = () => EMPTY_TASKS;

export function useTasks() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function getTasks() {
  return tasks;
}

export function _resetForTesting() {
  tasks = [];
  hydrated = false;
  listeners.clear();
}

export const store = {
  loadProject(data: ProjectData) {
    const loaded = Array.isArray(data.tasks) ? migrateTasks(data.tasks as Task[]) : [];
    tasks = ensurePositions(loaded);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    }
    listeners.forEach((l) => l());
  },
  add(partial: Partial<Task> & { title: string }) {
    const t = today();
    const siblings = tasks.filter((x) => x.parentId === (partial.parentId ?? null));
    const maxPos = siblings.length ? Math.max(...siblings.map((s) => s.position)) : -1;
    const newTask: Task = {
      id: uid(),
      parentId: partial.parentId ?? null,
      position: maxPos + 1,
      title: partial.title,
      assignee: partial.assignee ?? "",
      priority: partial.priority ?? "none",
      initialStartDate: partial.initialStartDate || undefined,
      initialEndDate:
        partial.initialEndDate &&
        partial.initialStartDate &&
        partial.initialEndDate < partial.initialStartDate
          ? partial.initialStartDate
          : partial.initialEndDate || undefined,
      estimatedStartDate: partial.estimatedStartDate || undefined,
      estimatedEndDate:
        partial.estimatedEndDate &&
        partial.estimatedStartDate &&
        partial.estimatedEndDate < partial.estimatedStartDate
          ? partial.estimatedStartDate
          : partial.estimatedEndDate || undefined,
      progress: partial.progress ?? 0,
      blocks: partial.blocks ?? [],
      dependencies: partial.dependencies ?? [],
      comments: [],
      createdAt: t,
    };
    tasks = [...tasks, newTask];
    persist();
    return newTask;
  },
  update(id: string, patch: Partial<Task>) {
    const target = tasks.find((x) => x.id === id);
    if (!target) return;
    const next: Task = { ...target, ...patch };

    if (!next.initialStartDate && next.initialEndDate) {
      next.initialEndDate = undefined;
    }
    if (
      next.initialStartDate &&
      next.initialEndDate &&
      next.initialEndDate < next.initialStartDate
    ) {
      next.initialEndDate = next.initialStartDate;
    }

    if (!next.estimatedStartDate && next.estimatedEndDate) {
      next.estimatedEndDate = undefined;
    }
    if (
      next.estimatedStartDate &&
      next.estimatedEndDate &&
      next.estimatedEndDate < next.estimatedStartDate
    ) {
      next.estimatedEndDate = next.estimatedStartDate;
    }

    if (!next.actualStartDate && next.actualEndDate) {
      next.actualEndDate = undefined;
    }
    if (next.actualStartDate && next.actualEndDate && next.actualEndDate < next.actualStartDate) {
      next.actualEndDate = next.actualStartDate;
    }

    if (
      next.initialStartDate &&
      next.initialEndDate &&
      !next.estimatedStartDate &&
      !next.estimatedEndDate
    ) {
      next.estimatedStartDate = next.initialStartDate;
      next.estimatedEndDate = next.initialEndDate;
    }

    if (next.parentId) {
      const parent = tasks.find((x) => x.id === next.parentId);
      if (
        parent?.initialStartDate &&
        next.initialStartDate &&
        next.initialStartDate < parent.initialStartDate
      ) {
        next.initialStartDate = parent.initialStartDate;
      }
    }

    tasks = tasks.map((x) => (x.id === id ? next : x));

    if (
      patch.initialStartDate &&
      next.initialStartDate &&
      next.initialStartDate !== target.initialStartDate
    ) {
      tasks = tasks.map((x) => {
        if (x.parentId !== id) return x;
        if (x.initialStartDate && x.initialStartDate < next.initialStartDate!) {
          const end =
            !x.initialEndDate || x.initialEndDate < next.initialStartDate!
              ? next.initialStartDate!
              : x.initialEndDate;
          return { ...x, initialStartDate: next.initialStartDate, initialEndDate: end };
        }
        return x;
      });
    }
    persist();
  },
  remove(id: string) {
    const ids = new Set<string>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of tasks) {
        if (t.parentId && ids.has(t.parentId) && !ids.has(t.id)) {
          ids.add(t.id);
          grew = true;
        }
      }
    }
    tasks = tasks.filter((t) => !ids.has(t.id));
    persist();
  },
  addComment(id: string, author: string, text: string) {
    tasks = tasks.map((t) =>
      t.id === id
        ? {
            ...t,
            comments: [
              ...t.comments,
              { id: uid(), author, text, createdAt: new Date().toISOString() },
            ],
          }
        : t,
    );
    persist();
  },
  deleteComment(taskId: string, commentId: string) {
    tasks = tasks.map((t) =>
      t.id === taskId ? { ...t, comments: t.comments.filter((c) => c.id !== commentId) } : t,
    );
    persist();
  },
  updateComment(taskId: string, commentId: string, text: string) {
    tasks = tasks.map((t) =>
      t.id === taskId
        ? { ...t, comments: t.comments.map((c) => (c.id === commentId ? { ...c, text } : c)) }
        : t,
    );
    persist();
  },
  addDependency(successorId: string, predecessorId: string, type: DependencyType) {
    tasks = tasks.map((t) =>
      t.id === successorId
        ? { ...t, dependencies: [...t.dependencies, { id: uid(), predecessorId, type }] }
        : t,
    );
    persist();
  },
  removeDependency(successorId: string, depId: string) {
    tasks = tasks.map((t) =>
      t.id === successorId
        ? { ...t, dependencies: t.dependencies.filter((d) => d.id !== depId) }
        : t,
    );
    persist();
  },
  updateDependency(successorId: string, depId: string, type: DependencyType) {
    tasks = tasks.map((t) =>
      t.id === successorId
        ? {
            ...t,
            dependencies: t.dependencies.map((d) => (d.id === depId ? { ...d, type } : d)),
          }
        : t,
    );
    persist();
  },
  reorder(taskId: string, toIndex: number) {
    const task = tasks.find((x) => x.id === taskId);
    if (!task) return;
    const siblings = tasks
      .filter((x) => x.parentId === task.parentId)
      .sort((a, b) => a.position - b.position);
    const fromIndex = siblings.findIndex((x) => x.id === taskId);
    if (fromIndex === -1 || fromIndex === toIndex) return;
    const [moved] = siblings.splice(fromIndex, 1);
    siblings.splice(toIndex, 0, moved);
    const updated = new Map(siblings.map((s, i) => [s.id, i]));
    tasks = tasks.map((t) => (updated.has(t.id) ? { ...t, position: updated.get(t.id)! } : t));
    persist();
  },
  /**
   * Ordena las tareas por disponibilidad de fecha primero (tiene real > tiene
   * solo estimada > tiene solo inicial > ninguna) y, dentro de cada nivel,
   * por fecha de inicio ascendente. Así una tarea con fecha real siempre
   * queda por encima de cualquiera sin fecha real, sin importar el valor
   * cronológico de esta última. Respeta la jerarquía: cada grupo de
   * hermanos (mismo parentId) se reordena de forma independiente. Las
   * tareas sin ninguna fecha van al final, manteniendo su orden relativo.
   */
  sortByDate() {
    const dateTier = (t: Task): { tier: number; date: string | undefined } => {
      if (t.actualStartDate) return { tier: 0, date: t.actualStartDate };
      if (t.estimatedStartDate) return { tier: 1, date: t.estimatedStartDate };
      if (t.initialStartDate) return { tier: 2, date: t.initialStartDate };
      return { tier: 3, date: undefined };
    };
    const byParent = new Map<string | null, Task[]>();
    for (const t of tasks) {
      const arr = byParent.get(t.parentId) ?? [];
      arr.push(t);
      byParent.set(t.parentId, arr);
    }
    const positionMap = new Map<string, number>();
    for (const arr of byParent.values()) {
      const base = [...arr].sort((a, b) => a.position - b.position);
      const sorted = base
        .map((t) => ({ t, ...dateTier(t) }))
        .sort((a, b) => {
          if (a.tier !== b.tier) return a.tier - b.tier;
          if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
          return 0;
        })
        .map((x) => x.t);
      sorted.forEach((t, i) => positionMap.set(t.id, i));
    }
    tasks = tasks.map((t) => ({ ...t, position: positionMap.get(t.id) ?? t.position }));
    persist();
  },
};

export function todayISO() {
  return today();
}
