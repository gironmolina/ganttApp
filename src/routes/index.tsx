import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { store, useTasks, type Task, todayISO } from "@/lib/gantt-store";
import { useSettings } from "@/lib/settings-store";
import { GanttChart } from "@/components/gantt/GanttChart";
import { TaskList } from "@/components/gantt/TaskList";
import { TaskDetail } from "@/components/gantt/TaskDetail";
import { SettingsDialog } from "@/components/gantt/SettingsDialog";

import { CalendarDays, Pencil } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gantt · Planificador de tareas" },
      {
        name: "description",
        content:
          "Crea, organiza y da seguimiento a tareas y subtareas con un diagrama de Gantt interactivo.",
      },
      { property: "og:title", content: "Gantt · Planificador de tareas" },
      {
        property: "og:description",
        content:
          "Planifica proyectos con Gantt: responsables, fechas, progreso, bloqueos y comentarios.",
      },
    ],
  }),
  component: Index,
});

function isScrollbarMouseDown(e: MouseEvent): boolean {
  let el = e.target as HTMLElement | null;
  while (el && el !== document.body) {
    const canScrollY = el.scrollHeight > el.clientHeight;
    const canScrollX = el.scrollWidth > el.clientWidth;
    if (canScrollY || canScrollX) {
      const rect = el.getBoundingClientRect();
      const onVertical = canScrollY && e.clientX >= rect.left + el.clientWidth;
      const onHorizontal = canScrollX && e.clientY >= rect.top + el.clientHeight;
      if (onVertical || onHorizontal) return true;
    }
    el = el.parentElement;
  }
  return false;
}

function buildOrder(tasks: Task[], collapsed: Set<string>) {
  const byParent = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const arr = byParent.get(t.parentId) ?? [];
    arr.push(t);
    byParent.set(t.parentId, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.position - b.position);
  const order: Task[] = [];
  const depth: Record<string, number> = {};
  const numbers: Record<string, string> = {};
  const walk = (parentId: string | null, d: number) => {
    const children = byParent.get(parentId) ?? [];
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      numbers[c.id] = parentId && numbers[parentId] ? `${numbers[parentId]}.${i + 1}` : `${i + 1}`;
      order.push(c);
      depth[c.id] = d;
      if (!collapsed.has(c.id)) walk(c.id, d + 1);
    }
  };
  walk(null, 0);
  return { order, depth, numbers };
}

function Index() {
  const tasks = useTasks();
  const settings = useSettings();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { order, depth, numbers } = useMemo(() => buildOrder(tasks, collapsed), [tasks, collapsed]);
  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  // Cierra el editor al hacer click fuera, salvo si el click es en una barra de
  // tarea, en una fila del listado, dentro del propio editor, o en una barra de
  // scroll (para permitir desplazar el Gantt sin cerrar el editor).
  useEffect(() => {
    if (!selectedId) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-task-editor]")) return;
      if (target.closest("[data-task-bar]")) return;
      if (target.closest("[data-task-row]")) return;
      if (target.closest("[data-radix-popper-content-wrapper]")) return;
      if (isScrollbarMouseDown(e)) return;
      setSelectedId(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [selectedId]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.progress >= 100).length;
    const blocked = tasks.filter((t) => t.blocks.length > 0 && t.progress < 100).length;
    const avg = total ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / total) : 0;
    let duration: {
      days: number;
      workdays: number;
      weeks: number;
      start: string;
      end: string;
    } | null = null;
    if (total) {
      const parse = (s: string) => {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
      };
      let mn = Infinity;
      let mx = -Infinity;
      for (const t of tasks) {
        if (t.initialStartDate) mn = Math.min(mn, parse(t.initialStartDate).getTime());
        if (t.initialEndDate) mx = Math.max(mx, parse(t.initialEndDate).getTime());
        if (t.estimatedStartDate) mn = Math.min(mn, parse(t.estimatedStartDate).getTime());
        if (t.estimatedEndDate) mx = Math.max(mx, parse(t.estimatedEndDate).getTime());
        if (t.actualStartDate) mn = Math.min(mn, parse(t.actualStartDate).getTime());
        if (t.actualEndDate) mx = Math.max(mx, parse(t.actualEndDate).getTime());
      }
      const days = Math.round((mx - mn) / 86400000) + 1;
      let workdays = 0;
      for (let i = 0; i < days; i++) {
        const g = new Date(mn + i * 86400000).getDay();
        if (g !== 0 && g !== 6) workdays++;
      }
      const fmt = (d: Date) =>
        d.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
      duration = {
        days,
        workdays,
        weeks: Math.ceil(workdays / 5),
        start: fmt(new Date(mn)),
        end: fmt(new Date(mx)),
      };
    }
    return { total, done, blocked, avg, duration };
  }, [tasks]);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const addTask = (parentId: string | null) => {
    const t = store.add({
      title: parentId ? "Nueva subtarea" : "Nueva tarea",
      parentId,
    });
    setSelectedId(t.id);
    if (parentId) {
      setCollapsed((prev) => {
        const n = new Set(prev);
        n.delete(parentId);
        return n;
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
                <CalendarDays className="h-4 w-4" />
              </span>
              {settings.name}
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                title="Editar proyecto"
                aria-label="Editar proyecto"
                className="ml-1 grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </h1>
            <p className="text-xs text-muted-foreground">
              Hoy es{" "}
              <span className="font-medium text-foreground">
                {new Date(todayISO()).toLocaleDateString("es", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
              {stats.duration && (
                <>
                  {" · "}
                  Duración del proyecto:{" "}
                  <span className="font-medium text-foreground">
                    {stats.duration.workdays} días hábiles
                  </span>{" "}
                  <span className="text-muted-foreground">
                    ({stats.duration.weeks} sem · {stats.duration.days} días naturales) ·{" "}
                    {stats.duration.start} → {stats.duration.end}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Stat label="Tareas" value={stats.total} />
            <Stat label="Completadas" value={stats.done} accent="var(--status-complete)" />
            <Stat label="Bloqueadas" value={stats.blocked} accent="var(--status-blocked)" />
            <Stat label="Progreso medio" value={`${stats.avg}%`} accent="var(--status-progress)" />
          </div>
        </div>
      </header>

      <main className="px-4 py-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <TaskList
            order={order}
            tasks={tasks}
            depth={depth}
            numbers={numbers}
            collapsed={collapsed}
            toggleCollapse={toggleCollapse}
            onSelect={setSelectedId}
            onAddSubtask={addTask}
            selectedId={selectedId}
            projectStart={settings.startDate}
            projectEnd={settings.endDate}
          />
          <div className="space-y-2">
            <Legend />
            <GanttChart
              tasks={tasks}
              order={order}
              onSelect={setSelectedId}
              selectedId={selectedId}
              projectStart={settings.startDate}
              projectEnd={settings.endDate}
            />
          </div>
        </div>
      </main>

      {selected && (
        <aside
          data-task-editor
          className="fixed right-0 top-0 z-40 h-screen w-full max-w-md border-l bg-card shadow-xl animate-in slide-in-from-right"
        >
          <TaskDetail
            task={selected}
            allTasks={tasks}
            onClose={() => setSelectedId(null)}
            onAddSubtask={(pid) => addTask(pid)}
            projectStartDate={settings.startDate}
          />
        </aside>
      )}

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="rounded-md border bg-card px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}

function Legend() {
  const items = [
    { c: "var(--status-progress)", l: "En progreso" },
    { c: "var(--status-complete)", l: "Completada", complete: true },
    { c: "var(--status-partial)", l: "Bloqueo parcial" },
    { c: "var(--status-blocked)", l: "Bloqueo total" },
    { c: "var(--status-delayed)", l: "Retrasado" },
    { c: "black", l: "Planificación inicial", solid: true },
    { c: "rgb(156,163,175)", l: "Estimada", dash: true },
    { c: "var(--today)", l: "Retraso inicio", arrow: true },
    { c: "var(--today)", l: "Hoy" },
  ];
  return (
    <div className="flex h-[40px] flex-wrap items-center gap-3 rounded-md border bg-card px-3 text-xs">
      {items.map((i) => (
        <div key={i.l} className="flex items-center gap-1.5">
          {"arrow" in i ? (
            <svg width="16" height="12" className="shrink-0">
              <line x1="0" y1="6" x2="10" y2="6" stroke={i.c} strokeWidth="2" />
              <polygon points="16,6 10,2 10,10" fill={i.c} />
            </svg>
          ) : "dash" in i ? (
            <span
              className="h-3 w-3 shrink-0 border-2 border-dashed bg-transparent"
              style={{ borderColor: i.c }}
            />
          ) : "solid" in i ? (
            <span
              className="h-3 w-3 shrink-0 border-2 border-solid bg-transparent"
              style={{ borderColor: i.c }}
            />
          ) : "complete" in i ? (
            <span
              className="h-3 w-3 shrink-0 border-[3px] border-solid bg-transparent"
              style={{ borderColor: i.c }}
            />
          ) : (
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: i.c }} />
          )}
          <span className="text-muted-foreground">{i.l}</span>
        </div>
      ))}
    </div>
  );
}
