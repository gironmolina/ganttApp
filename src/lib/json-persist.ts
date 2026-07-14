import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createServerFn } from "@tanstack/react-start";

const DATA_DIR = process.cwd();
const FILE = join(DATA_DIR, "project-data.json");

interface ProjectData {
  tasks: unknown[];
  settings: Record<string, unknown>;
}

function read(): ProjectData | null {
  if (!existsSync(FILE)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf-8")) as ProjectData;
    if (!Array.isArray(raw.tasks)) raw.tasks = [];
    if (typeof raw.settings !== "object" || raw.settings === null) raw.settings = {};
    return raw;
  } catch {
    return null;
  }
}

function write(data: ProjectData): void {
  writeFileSync(FILE, JSON.stringify(data, null, 2), "utf-8");
}

export const getProjectData = createServerFn({ method: "GET", strict: false }).handler(async () => {
  return read();
});

export const mergeProjectData = createServerFn({ method: "POST", strict: false })
  .validator((d: unknown) => {
    const data = (d ?? {}) as Partial<ProjectData>;
    return {
      tasks: Array.isArray(data.tasks) ? data.tasks : undefined,
      settings:
        typeof data.settings === "object" && data.settings !== null
          ? (data.settings as Record<string, unknown>)
          : undefined,
    };
  })
  .handler(async ({ data }) => {
    const existing = read() ?? { tasks: [], settings: {} };
    write({
      tasks: data.tasks ?? existing.tasks,
      settings: data.settings ?? existing.settings,
    });
    return { ok: true };
  });
