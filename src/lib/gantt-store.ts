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
  title: string;
  assignee: string;
  startDate: string;
  endDate: string;
  actualStartDate?: string;
  actualEndDate?: string;
  progress: number;
  block: BlockStatus;
  blockReason?: string;
  comments: Comment[];
  createdAt: string;
}

const STORAGE_KEY = "gantt-tasks-v1";

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
      title: "Planificación del proyecto",
      assignee: "Ana Torres",
      startDate: t,
      endDate: addDays(t, 6),
      progress: 60,
      block: "none",
      comments: [],
      createdAt: t,
    },
    {
      id: uid(),
      parentId: p1,
      title: "Definir alcance",
      assignee: "Ana Torres",
      startDate: t,
      endDate: addDays(t, 2),
      progress: 100,
      block: "none",
      comments: [],
      createdAt: t,
    },
    {
      id: uid(),
      parentId: p1,
      title: "Kick-off con stakeholders",
      assignee: "Luis Pérez",
      startDate: addDays(t, 3),
      endDate: addDays(t, 5),
      progress: 40,
      block: "partial",
      blockReason: "Esperando disponibilidad de cliente",
      comments: [],
      createdAt: t,
    },
    {
      id: p2,
      parentId: null,
      title: "Desarrollo MVP",
      assignee: "Equipo Dev",
      startDate: addDays(t, 7),
      endDate: addDays(t, 21),
      progress: 10,
      block: "none",
      comments: [],
      createdAt: t,
    },
    {
      id: uid(),
      parentId: p2,
      title: "Diseño UI",
      assignee: "María Gómez",
      startDate: addDays(t, 7),
      endDate: addDays(t, 12),
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

function loadFromLocalStorage(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const s = seed();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      return s;
    }
    return JSON.parse(raw);
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
        tasks = serverTasks;
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
    const parent = partial.parentId ? tasks.find((x) => x.id === partial.parentId) : null;
    let startDate = partial.startDate ?? (parent ? parent.startDate : t);
    let endDate = partial.endDate ?? addDays(startDate, 3);
    if (parent) {
      if (startDate < parent.startDate) startDate = parent.startDate;
      if (endDate < startDate) endDate = startDate;
    }
    const newTask: Task = {
      id: uid(),
      parentId: partial.parentId ?? null,
      title: partial.title,
      assignee: partial.assignee ?? "",
      startDate,
      endDate,
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

    if (next.parentId) {
      const parent = tasks.find((x) => x.id === next.parentId);
      if (parent && next.startDate < parent.startDate) {
        next.startDate = parent.startDate;
      }
    }
    if (next.endDate < next.startDate) next.endDate = next.startDate;

    tasks = tasks.map((x) => (x.id === id ? next : x));

    if (patch.startDate && next.startDate !== target.startDate) {
      tasks = tasks.map((x) => {
        if (x.parentId !== id) return x;
        if (x.startDate < next.startDate) {
          const end = x.endDate < next.startDate ? next.startDate : x.endDate;
          return { ...x, startDate: next.startDate, endDate: end };
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
};

export function todayISO() {
  return today();
}
