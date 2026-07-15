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
  computeProgress,
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
            const progress = computeProgress(task);
            const hasActual = !!(task.actualStartDate && task.actualEndDate);
            const hasEstimated = !!(task.estimatedStartDate && task.estimatedEndDate);
            const hasInitial = !!(task.initialStartDate && task.initialEndDate);
            const isParent = tasks.some((t) => t.parentId === task.id);
            const barBgColor =
              progress >= 100 ? "bg-[var(--status-complete)]" : "bg-[var(--status-progress)]";

            // Initial bar positions
            let iLeft = 0,
              iWidth = 0;
            if (hasInitial) {
              const sIdx = findDateIndex(task.initialStartDate!, "start", workdays, dateToIndex);
              const eIdx = findDateIndex(task.initialEndDate!, "end", workdays, dateToIndex);
              const from = Math.min(sIdx, eIdx);
              const to = Math.max(sIdx, eIdx);
              iLeft = from * COL_WIDTH;
              iWidth = Math.max(COL_WIDTH * 0.6, (to - from + 1) * COL_WIDTH);
            }

            // Estimated bar positions
            let eLeft = 0,
              eWidth = 0;
            if (hasEstimated) {
              const sIdx = findDateIndex(task.estimatedStartDate!, "start", workdays, dateToIndex);
              const eIdx = findDateIndex(task.estimatedEndDate!, "end", workdays, dateToIndex);
              const from = Math.min(sIdx, eIdx);
              const to = Math.max(sIdx, eIdx);
              eLeft = from * COL_WIDTH;
              eWidth = Math.max(COL_WIDTH * 0.6, (to - from + 1) * COL_WIDTH);
            }

            // Actual bar positions
            let aLeft = 0,
              aWidth = 0;
            if (hasActual) {
              const aStartIdx = findDateIndex(
                task.actualStartDate!,
                "start",
                workdays,
                dateToIndex,
              );
              const aEndIdx = findDateIndex(task.actualEndDate!, "end", workdays, dateToIndex);
              const aFrom = Math.min(aStartIdx, aEndIdx);
              const aTo = Math.max(aStartIdx, aEndIdx);
              aLeft = aFrom * COL_WIDTH;
              aWidth = Math.max(COL_WIDTH * 0.6, (aTo - aFrom + 1) * COL_WIDTH);
            }

            // Delay at end (actualEndDate > estimatedEndDate)
            const isDelayed =
              hasActual &&
              hasEstimated &&
              !!task.estimatedEndDate &&
              !!task.actualEndDate &&
              task.actualEndDate > task.estimatedEndDate;
            const delayLeft = isDelayed ? eLeft + eWidth : 0;
            const effectiveDelayLeft = isDelayed ? Math.max(delayLeft, aLeft) : 0;
            const effectiveDelayWidth = isDelayed ? aLeft + aWidth - effectiveDelayLeft : 0;
            const normalLeft = aLeft;
            const normalWidth = isDelayed ? Math.max(0, delayLeft - aLeft) : aWidth;

            // Start delay arrow (actualStartDate > estimatedStartDate)
            const isStartDelayed =
              hasActual &&
              hasInitial &&
              !!task.actualStartDate &&
              !!task.initialStartDate &&
              task.actualStartDate > task.initialStartDate;
            const startDelayLeft = isStartDelayed ? iLeft : 0;
            const startDelayWidth = isStartDelayed ? aLeft - iLeft : 0;

            // Which bar is clickable (prefer estimated, fallback to initial)
            const clickBar = hasEstimated ? "estimated" : hasInitial ? "initial" : null;

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

                {/* Actual bar — zIndex 1 */}
                {hasActual && (
                  <button
                    onClick={() => onSelect(task.id)}
                    className={cn(
                      "group absolute top-1/2 flex -translate-y-1/2 items-center overflow-hidden text-left text-xs text-white shadow-sm transition hover:brightness-110",
                      barBgColor,
                      isParent && "opacity-90 ring-1 ring-white/30",
                    )}
                    style={{ left: normalLeft, width: normalWidth, height: 22, zIndex: 1 }}
                    title={`Real: ${task.title} · ${progress}%${hasEstimated ? ` · Estimada: ${task.estimatedStartDate} → ${task.estimatedEndDate}` : ""}`}
                  />
                )}

                {/* Delayed segment — zIndex 1 */}
                {hasActual && isDelayed && effectiveDelayWidth > 0 && (
                  <div
                    className="pointer-events-none absolute top-1/2 -translate-y-1/2 bg-[var(--status-delayed)]"
                    style={{
                      left: effectiveDelayLeft,
                      width: effectiveDelayWidth,
                      height: 22,
                      zIndex: 1,
                    }}
                    title={`Retraso: ${task.estimatedEndDate} → ${task.actualEndDate}`}
                  />
                )}

                {/* Block range lines — zIndex 2 */}
                {task.blocks.map((block) => {
                  const bStartIdx = findDateIndex(block.startDate, "start", workdays, dateToIndex);
                  const bEndIdx = findDateIndex(block.endDate, "end", workdays, dateToIndex);
                  const bFrom = Math.min(bStartIdx, bEndIdx);
                  const bTo = Math.max(bStartIdx, bEndIdx);
                  const bLeft = bFrom * COL_WIDTH;
                  const bWidth = Math.max(2, (bTo - bFrom + 1) * COL_WIDTH);
                  const isTotal = block.type === "total";
                  return (
                    <div
                      key={block.id}
                      className={cn(
                        "pointer-events-none absolute top-1/2 -translate-y-1/2 border-l-2 border-r-2 border-[var(--status-blocked)]",
                        isTotal && "bg-[var(--status-blocked)]",
                      )}
                      style={{
                        left: bLeft,
                        width: bWidth,
                        height: 22,
                        zIndex: 2,
                        ...(!isTotal && {
                          backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 4px, var(--status-blocked) 4px, var(--status-blocked) 5.5px)`,
                        }),
                      }}
                      title={`${isTotal ? "Bloqueo total" : "Bloqueo parcial"}${block.reason ? `: ${block.reason}` : ""} · ${block.startDate} → ${block.endDate}`}
                    />
                  );
                })}

                {/* Progress border overlay — zIndex 3 */}
                {progress > 0 &&
                  (() => {
                    const barL = hasActual ? aLeft : hasEstimated ? eLeft : iLeft;
                    const barW = hasActual ? aWidth : hasEstimated ? eWidth : iWidth;
                    const fillW = barW * (progress / 100);
                    return (
                      <div
                        className="pointer-events-none absolute top-1/2 -translate-y-1/2 overflow-hidden"
                        style={{ left: barL, width: fillW, height: 22, zIndex: 8 }}
                      >
                        <div
                          className="h-full border-[3px] border-solid border-[var(--status-complete)]"
                          style={{ width: barW, height: 22 }}
                        />
                      </div>
                    );
                  })()}

                {/* Estimated bar — zIndex 4, dashed gray */}
                {hasEstimated &&
                  (hasActual ? (
                    <div
                      className="pointer-events-none absolute top-1/2 -translate-y-1/2 border-2 border-dashed bg-transparent border-gray-400"
                      style={{ left: eLeft, width: eWidth, height: 22, zIndex: 4 }}
                    />
                  ) : (
                    <div
                      onClick={() => onSelect(task.id)}
                      className={cn(
                        "absolute top-1/2 flex cursor-pointer -translate-y-1/2 items-center overflow-hidden border-2 border-dashed bg-transparent border-gray-400 text-left text-xs transition hover:brightness-110",
                        isParent && "opacity-90",
                      )}
                      style={{ left: eLeft, width: eWidth, height: 22, zIndex: 4 }}
                      title={`${task.title} · Estimada: ${task.estimatedStartDate} → ${task.estimatedEndDate}`}
                    />
                  ))}

                {/* Initial bar — zIndex 5, dashed black */}
                {hasInitial && (
                  <div
                    className="pointer-events-none absolute top-1/2 -translate-y-1/2 border-2 border-dashed bg-transparent border-black/60"
                    style={{ left: iLeft, width: iWidth, height: 22, zIndex: 5 }}
                  />
                )}

                {/* Start delay arrow — zIndex 6 */}
                {isStartDelayed && startDelayWidth > 0 && (
                  <svg
                    className="pointer-events-none absolute top-0"
                    style={{
                      left: startDelayLeft,
                      width: startDelayWidth,
                      height: ROW_HEIGHT,
                      zIndex: 6,
                    }}
                  >
                    <line
                      x1="0"
                      y1="50%"
                      x2="100%"
                      y2="50%"
                      stroke="var(--today)"
                      strokeWidth="2"
                    />
                    <polygon
                      points={`${startDelayWidth},${ROW_HEIGHT / 2} ${startDelayWidth - 6},${ROW_HEIGHT / 2 - 4} ${startDelayWidth - 6},${ROW_HEIGHT / 2 + 4}`}
                      fill="var(--today)"
                    />
                  </svg>
                )}

                {/* Task label — zIndex 7, always on top */}
                {(() => {
                  const textLeft = hasActual ? aLeft : hasEstimated ? eLeft : iLeft;
                  const textWidth = hasActual ? aWidth : hasEstimated ? eWidth : iWidth;
                  if (!textWidth) return null;
                  return (
                    <div
                      className="pointer-events-none absolute top-0 flex items-center overflow-hidden text-left text-xs font-medium text-white"
                      style={{
                        left: textLeft,
                        width: textWidth,
                        height: ROW_HEIGHT,
                        zIndex: 9,
                        textShadow: "0 1px 3px rgba(0,0,0,0.6)",
                      }}
                    >
                      <span className="truncate px-2">
                        {task.title} · {progress}%
                      </span>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
