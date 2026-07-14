import { useMemo } from "react";
import type { Task } from "@/lib/gantt-store";
import { todayISO } from "@/lib/gantt-store";
import { cn } from "@/lib/utils";
import {
  COL_WIDTH,
  ROW_HEIGHT,
  buildTimeline,
  buildSprints,
  findDateIndex,
  toLocalIso,
  fmtShort,
} from "@/lib/gantt-utils";

export function GanttChart({
  tasks,
  order,
  onSelect,
  selectedId,
  projectStart,
  projectEnd,
}: {
  tasks: Task[];
  order: Task[];
  onSelect: (id: string) => void;
  selectedId: string | null;
  projectStart?: string;
  projectEnd?: string;
}) {
  const { workdays, dateToIndex, weekStarts } = useMemo(
    () => buildTimeline(tasks, projectStart, projectEnd),
    [tasks, projectStart, projectEnd],
  );

  const totalWidth = workdays.length * COL_WIDTH;

  const sprints = useMemo(() => buildSprints(workdays, weekStarts), [workdays, weekStarts]);

  const todayIso = todayISO();
  const todayIdx = dateToIndex.has(todayIso) ? dateToIndex.get(todayIso)! : null;
  const todayOffset = todayIdx !== null ? todayIdx * COL_WIDTH + COL_WIDTH / 2 : -1;

  return (
    <div className="overflow-auto rounded-lg border bg-card">
      <div style={{ width: totalWidth, minWidth: "100%" }}>
        {/* Sprint header */}
        <div
          className="sticky top-0 z-20 flex border-b bg-muted/80 backdrop-blur"
          style={{ width: totalWidth, height: 44 }}
        >
          {sprints.map((sp) => (
            <div
              key={sp.number}
              className="flex flex-col items-center justify-center border-r border-border/80 py-1 text-[11px] font-semibold"
              style={{ width: sp.width, minWidth: sp.width }}
            >
              <span className="text-primary">Sprint {sp.number}</span>
              <span className="text-[9px] font-normal text-muted-foreground">
                {fmtShort(sp.start)} – {fmtShort(sp.end)}
              </span>
            </div>
          ))}
        </div>

        {/* Day header */}
        <div
          className="sticky z-10 flex border-b bg-muted/60 backdrop-blur"
          style={{ width: totalWidth, top: 44, height: 30 }}
        >
          {workdays.map((d, i) => {
            const iso = toLocalIso(d);
            const isToday = iso === todayIso;
            const isFriday = d.getDay() === 5;
            return (
              <div
                key={i}
                className={cn(
                  "flex flex-col items-center justify-center border-r py-1 text-[10px]",
                  isFriday && "border-r-border/80",
                  isToday && "bg-[var(--today)]/15 font-semibold text-[var(--today)]",
                )}
                style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
              >
                <span className="uppercase">
                  {d.toLocaleDateString("es", { weekday: "short" }).slice(0, 1)}
                </span>
                <span>{d.getDate()}</span>
              </div>
            );
          })}
        </div>

        {/* Rows */}
        <div className="relative">
          {/* today line */}
          {todayOffset >= 0 && (
            <div
              className="pointer-events-none absolute top-0 z-20 h-full w-px bg-[var(--today)]"
              style={{ left: todayOffset }}
            >
              <span className="absolute -top-0 left-1 rounded bg-[var(--today)] px-1 py-0.5 text-[9px] font-medium text-white">
                Hoy
              </span>
            </div>
          )}

          {/* sprint dividers */}
          <div className="pointer-events-none absolute inset-0">
            {sprints.slice(1).map((sp) => (
              <div
                key={sp.number}
                className="absolute top-0 h-full w-px bg-border"
                style={{ left: sp.left }}
              />
            ))}
          </div>

          {order.map((task, rowIdx) => {
            const startIdx = findDateIndex(task.startDate, "start", workdays, dateToIndex);
            const endIdx = findDateIndex(task.endDate, "end", workdays, dateToIndex);
            const from = Math.min(startIdx, endIdx);
            const to = Math.max(startIdx, endIdx);
            const left = from * COL_WIDTH;
            const width = Math.max(COL_WIDTH * 0.6, (to - from + 1) * COL_WIDTH - 2);
            const isParent = tasks.some((t) => t.parentId === task.id);
            const barColor =
              task.progress >= 100
                ? "bg-[var(--status-complete)]"
                : task.block === "total"
                  ? "bg-[var(--status-blocked)]"
                  : task.block === "partial"
                    ? "bg-[var(--status-partial)]"
                    : "bg-[var(--status-progress)]";

            return (
              <div
                key={task.id}
                className={cn(
                  "relative border-b hover:bg-accent/30",
                  rowIdx % 2 === 1 && "bg-muted/20",
                  selectedId === task.id && "bg-accent/50",
                )}
                style={{ height: ROW_HEIGHT }}
              >
                {/* day grid */}
                <div className="pointer-events-none absolute inset-0 flex">
                  {workdays.map((wd, i) => (
                    <div
                      key={i}
                      className={cn(
                        "border-r border-border/40",
                        wd.getDay() === 5 && "border-r-border",
                      )}
                      style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                    />
                  ))}
                </div>

                <button
                  onClick={() => onSelect(task.id)}
                  className={cn(
                    "group absolute top-1/2 flex -translate-y-1/2 items-center overflow-hidden rounded-md text-left text-xs text-white shadow-sm transition hover:brightness-110",
                    barColor,
                    isParent && "opacity-90 ring-1 ring-white/30",
                  )}
                  style={{ left, width, height: 22 }}
                  title={`${task.title} • ${fmtShort(workdays[from])} → ${fmtShort(workdays[to])}`}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-black/25"
                    style={{ width: `${task.progress}%` }}
                  />
                  <span className="relative z-10 truncate px-2 font-medium">
                    {task.title} · {task.progress}%
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
