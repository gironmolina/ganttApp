import { useSyncExternalStore } from "react";
import { getProjectData, mergeProjectData } from "./json-persist";

export type BlockStatus = "none" | "partial" | "total";

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
  initialStartDate?: string;
  initialEndDate?: string;
  estimatedStartDate?: string;
  estimatedEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  progress: number;
  block: BlockStatus;
  blockReason?: string;
  comments: Comment[];
  createdAt: string;
}

const STORAGE_KEY = "gantt-tasks-v2";

const uid = () => Math.random().toString(36).slice(2, 10);

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};

function seed(): Task[] {
  const t = today();
  const p1 = uid();
  const p2 = uid();
  return [
    {
      id: p1,
      parentId: null,
      position: 0,
      title: "Planificación del proyecto",
      assignee: "Ana Torres",
      initialStartDate: t,
      initialEndDate: addDays(t, 6),
      estimatedStartDate: t,
      estimatedEndDate: addDays(t, 6),
      progress: 60,
      block: "none",
      comments: [],
      createdAt: t,
    },
    {
      id: uid(),
      parentId: p1,
      position: 0,
      title: "Definir alcance",
      assignee: "Ana Torres",
      initialStartDate: t,
      initialEndDate: addDays(t, 2),
      estimatedStartDate: t,
      estimatedEndDate: addDays(t, 2),
      progress: 100,
      block: "none",
      comments: [],
      createdAt: t,
    },
    {
      id: uid(),
      parentId: p1,
      position: 1,
      title: "Kick-off con stakeholders",
      assignee: "Luis Pérez",
      initialStartDate: addDays(t, 3),
      initialEndDate: addDays(t, 5),
      estimatedStartDate: addDays(t, 4),
      estimatedEndDate: addDays(t, 7),
      actualStartDate: addDays(t, 4),
      actualEndDate: addDays(t, 7),
      progress: 40,
      block: "partial",
      blockReason: "Esperando disponibilidad de cliente",
      comments: [],
      createdAt: t,
    },
    {
      id: p2,
      parentId: null,
      position: 1,
      title: "Desarrollo MVP",
      assignee: "Equipo Dev",
      initialStartDate: addDays(t, 7),
      initialEndDate: addDays(t, 21),
      estimatedStartDate: addDays(t, 7),
      estimatedEndDate: addDays(t, 21),
      progress: 10,
      block: "none",
      comments: [],
      createdAt: t,
    },
    {
      id: uid(),
      parentId: p2,
      position: 0,
      title: "Diseño UI",
      assignee: "María Gómez",
      initialStartDate: addDays(t, 7),
      initialEndDate: addDays(t, 12),
      estimatedStartDate: addDays(t, 7),
      estimatedEndDate: addDays(t, 12),
      progress: 30,
      block: "none",
      comments: [],
      createdAt: t,
    },
  ];
}

async function saveToServer(tasks: Task[]): Promise<void> {
  try {
    await mergeProjectData({ data: { tasks } });
  } catch {
    /* network error — ignore */
  }
}

async function loadFromServer(): Promise<Task[] | null> {
  try {
    const data = await getProjectData();
    if (!data) return null;
    return Array.isArray(data.tasks) ? (data.tasks as Task[]) : null;
  } catch {
    return null;
  }
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
    if (t.startDate !== undefined && t.initialStartDate === undefined) {
      const { startDate, endDate, ...rest } = t;
      return {
        ...rest,
        initialStartDate: startDate || undefined,
        initialEndDate: endDate || undefined,
      } as Task;
    }
    return t as Task;
  });
}

function loadFromLocalStorage(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const s = seed();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      return s;
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
  saveToServer(tasks);
}

function ensureHydrated() {
  if (!hydrated && typeof window !== "undefined") {
    tasks = loadFromLocalStorage();
    hydrated = true;
    loadFromServer().then((serverTasks) => {
      if (serverTasks !== null) {
        tasks = migrateTasks(serverTasks);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        listeners.forEach((l) => l());
      } else {
        saveToServer(tasks);
      }
    });
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
      block: partial.block ?? "none",
      blockReason: partial.blockReason,
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
};

export function todayISO() {
  return today();
}
