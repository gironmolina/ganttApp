import { type Task, store as ganttStore, todayISO } from "@/lib/gantt-store";
import { cn } from "@/lib/utils";
import { setHoveredTask } from "@/lib/hover-sync";
import {
  computeTimeProgress,
  parseDate,
  fmtShort,
  countWorkdays,
  toLocalIso,
} from "@/lib/gantt-utils";
import {
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Plus,
  MessageSquare,
  GripVertical,
  Columns3,
  Flag,
  CalendarArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { useState, useRef, useEffect, Fragment, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const COL_WIDTHS_KEY = "gantt-col-widths";
const COL_VISIBLE_KEY = "gantt-col-visible";

function loadWidths() {
  if (typeof window === "undefined") return { responsable: 90, progress: 44 };
  try {
    const raw = localStorage.getItem(COL_WIDTHS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { responsable: 90, progress: 44 };
}

function loadVisible() {
  if (typeof window === "undefined") return { responsable: true, progress: true };
  try {
    const raw = localStorage.getItem(COL_VISIBLE_KEY);
    if (raw) return { responsable: true, progress: true, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { responsable: true, progress: true };
}

export function TaskList({
  order,
  tasks,
  depth,
  numbers,
  collapsed,
  toggleCollapse,
  onSelect,
  onAddSubtask,
  selectedId,
  projectStart,
  projectEnd,
  scrollRef,
  onScrollSync,
}: {
  order: Task[];
  tasks: Task[];
  depth: Record<string, number>;
  numbers: Record<string, string>;
  collapsed: Set<string>;
  toggleCollapse: (id: string) => void;
  onSelect: (id: string) => void;
  onAddSubtask: (parentId: string | null) => void;
  selectedId: string | null;
  projectStart?: string;
  projectEnd?: string;
  scrollRef?: React.Ref<HTMLDivElement>;
  onScrollSync?: () => void;
}) {
  const [colWidths, setColWidths] = useState(loadWidths);
  const [colVisible, setColVisible] = useState(loadVisible);

  useEffect(() => {
    localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(colWidths));
  }, [colWidths]);

  useEffect(() => {
    localStorage.setItem(COL_VISIBLE_KEY, JSON.stringify(colVisible));
  }, [colVisible]);

  const [resizing, setResizing] = useState<"responsable" | "progress" | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const startResize = useCallback(
    (col: "responsable" | "progress", e: React.MouseEvent) => {
      e.preventDefault();
      setResizing(col);
      startXRef.current = e.clientX;
      startWidthRef.current = colWidths[col];
    },
    [colWidths],
  );

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const min = resizing === "responsable" ? 60 : 30;
      // Los grips estan en el borde izquierdo de cada columna: arrastrar hacia la
      // izquierda (delta negativo) ensancha la columna.
      setColWidths((prev: { responsable: number; progress: number }) => ({
        ...prev,
        [resizing]: Math.max(min, startWidthRef.current - delta),
      }));
    };
    const onUp = () => setResizing(null);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [resizing]);

  const gridStyle = {
    gridTemplateColumns: [
      "1fr",
      colVisible.responsable ? `${colWidths.responsable}px` : null,
      colVisible.progress ? `${colWidths.progress}px` : null,
    ]
      .filter(Boolean)
      .join(" "),
  };

  const byParent = new Map<string | null, Task[]>();
  for (const t of order) {
    const arr = byParent.get(t.parentId) ?? [];
    arr.push(t);
    byParent.set(t.parentId, arr);
  }

  const allSiblings = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const key = t.parentId ?? null;
    const arr = allSiblings.get(key) ?? [];
    arr.push(t);
    allSiblings.set(key, arr);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeTask = tasks.find((t) => t.id === active.id);
    if (!activeTask) return;
    const siblings = allSiblings.get(activeTask.parentId) ?? [];
    const overTask = siblings.find((t) => t.id === over.id);
    if (!overTask || overTask.parentId !== activeTask.parentId) return;
    const sorted = [...siblings].sort((a, b) => a.position - b.position);
    const toIndex = sorted.findIndex((t) => t.id === over.id);
    ganttStore.reorder(active.id as string, toIndex);
  };

  const walk = (parentId: string | null) => {
    const children = byParent.get(parentId) ?? [];
    const sorted = [...children].sort((a, b) => a.position - b.position);
    const ids = sorted.map((t) => t.id);

    return (
      <SortableContext
        key={`group-${parentId ?? "root"}`}
        items={ids}
        strategy={verticalListSortingStrategy}
      >
        {sorted.map((task) => (
          <Fragment key={task.id}>
            <SortableRow
              task={task}
              depth={depth[task.id] ?? 0}
              number={numbers[task.id] ?? ""}
              hasChildren={tasks.some((t) => t.parentId === task.id)}
              isCollapsed={collapsed.has(task.id)}
              isSelected={selectedId === task.id}
              onToggleCollapse={toggleCollapse}
              onSelect={onSelect}
              gridStyle={gridStyle}
              showResponsable={colVisible.responsable}
              showProgress={colVisible.progress}
            />
            {!collapsed.has(task.id) && byParent.has(task.id) && walk(task.id)}
          </Fragment>
        ))}
      </SortableContext>
    );
  };

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", resizing && "select-none")}>
      <div className="flex h-[40px] shrink-0 items-center justify-between overflow-hidden rounded-md border bg-card px-2">
        <div className="text-xs font-semibold">Tareas</div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[11px]"
                title="Mostrar u ocultar columnas"
              >
                <Columns3 className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Columnas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={colVisible.responsable}
                onCheckedChange={(v) =>
                  setColVisible((prev: { responsable: boolean; progress: boolean }) => ({
                    ...prev,
                    responsable: v,
                  }))
                }
                onSelect={(e) => e.preventDefault()}
              >
                Responsable
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={colVisible.progress}
                onCheckedChange={(v) =>
                  setColVisible((prev: { responsable: boolean; progress: boolean }) => ({
                    ...prev,
                    progress: v,
                  }))
                }
                onSelect={(e) => e.preventDefault()}
              >
                Porcentaje
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px]"
            title="Ordenar por fecha (real → estimada → planificada)"
            onClick={() => ganttStore.sortByDate()}
          >
            <CalendarArrowDown className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px]"
            onClick={() => onAddSubtask(null)}
          >
            <Plus className="mr-1 h-3 w-3" /> Nueva
          </Button>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScrollSync}
        className="gantt-scroll min-h-0 overflow-y-auto rounded-lg border bg-card"
      >
        <div className="sticky top-0 z-20 bg-card">
          <ProjectTimeBar projectStart={projectStart} projectEnd={projectEnd} tasks={tasks} />
        </div>
        <div
          className="sticky top-[44px] z-[15] grid h-[30px] items-center gap-1 border-b bg-muted/80 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur"
          style={gridStyle}
        >
          <div>Tarea</div>
          {colVisible.responsable && (
            <div className="relative pl-2">
              <span className="block truncate">Responsable</span>
              <div
                className="group absolute -top-px bottom-[-1px] left-0 z-10 flex w-2 -translate-x-1/2 cursor-col-resize items-stretch justify-center"
                onMouseDown={(e) => startResize("responsable", e)}
                title="Ajustar ancho de Responsable"
              >
                <div className="w-px bg-border transition-colors group-hover:w-0.5 group-hover:bg-primary" />
              </div>
            </div>
          )}
          {colVisible.progress && (
            <div className="relative pl-2 text-right">
              %
              <div
                className="group absolute -top-px bottom-[-1px] left-0 z-10 flex w-2 -translate-x-1/2 cursor-col-resize items-stretch justify-center"
                onMouseDown={(e) => startResize("progress", e)}
                title="Ajustar ancho de Porcentaje"
              >
                <div className="w-px bg-border transition-colors group-hover:w-0.5 group-hover:bg-primary" />
              </div>
            </div>
          )}
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {walk(null)}
        </DndContext>
        {/* Iguala el scrollTop máximo: el panel derecho pierde 10px de alto por su scrollbar horizontal */}
        <div aria-hidden className="h-[10px]" />
      </div>
    </div>
  );
}

function ProjectTimeBar({
  projectStart,
  projectEnd,
  tasks,
}: {
  projectStart?: string;
  projectEnd?: string;
  tasks: Task[];
}) {
  if (!projectStart || !projectEnd) {
    return <div className="h-[44px] border-b bg-muted/40" />;
  }
  const { percent, elapsedDays, totalDays } = computeTimeProgress(
    projectStart,
    projectEnd,
    todayISO(),
  );
  const startLabel = fmtShort(new Date(parseDate(projectStart)));
  const endLabel = fmtShort(new Date(parseDate(projectEnd)));

  let maxEndMs = parseDate(projectEnd);
  for (const t of tasks) {
    if (t.initialEndDate) maxEndMs = Math.max(maxEndMs, parseDate(t.initialEndDate));
    if (t.estimatedEndDate) maxEndMs = Math.max(maxEndMs, parseDate(t.estimatedEndDate));
    if (t.actualEndDate) maxEndMs = Math.max(maxEndMs, parseDate(t.actualEndDate));
  }
  const projectEndMs = parseDate(projectEnd);
  const projectStartMs = parseDate(projectStart);
  const hasExtra = maxEndMs > projectEndMs;
  const extraDays = hasExtra ? countWorkdays(projectEnd, toLocalIso(new Date(maxEndMs))) : 0;

  const totalSpanMs = maxEndMs - projectStartMs;
  const projectWidthPercent = hasExtra
    ? Math.round(((projectEndMs - projectStartMs) / totalSpanMs) * 100)
    : 100;
  const fillWidthPercent = (percent / 100) * projectWidthPercent;

  return (
    <div className="flex h-[44px] flex-col justify-center gap-1 border-b bg-muted/40 px-2">
      <div className="flex items-center justify-between text-[9px] text-muted-foreground">
        <span className="font-medium text-foreground">{startLabel}</span>
        <span className="font-semibold text-[var(--status-progress)]">
          {percent}% · {elapsedDays}/{totalDays} días
          {hasExtra && (
            <span className="text-[var(--status-delayed)]"> · +{extraDays} días extra</span>
          )}
        </span>
        <span className="font-medium text-foreground">{endLabel}</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--status-progress)]"
          style={{ width: `${fillWidthPercent}%` }}
        />
        {hasExtra && (
          <div
            className="absolute inset-y-0 rounded-none"
            style={{
              left: `${projectWidthPercent}%`,
              right: 0,
              backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 2px, oklch(0.7 0.15 50 / 0.3) 2px, oklch(0.7 0.15 50 / 0.3) 4px)`,
            }}
          />
        )}
        {percent > 0 && percent < 100 && (
          <div
            className="absolute inset-y-0 w-px bg-[var(--today)]"
            style={{ left: `${fillWidthPercent}%` }}
          />
        )}
      </div>
    </div>
  );
}

function SortableRow({
  task,
  depth,
  number,
  hasChildren,
  isCollapsed,
  isSelected,
  onToggleCollapse,
  onSelect,
  gridStyle,
  showResponsable,
  showProgress,
}: {
  task: Task;
  depth: number;
  number: string;
  hasChildren: boolean;
  isCollapsed: boolean;
  isSelected: boolean;
  onToggleCollapse: (id: string) => void;
  onSelect: (id: string) => void;
  gridStyle: React.CSSProperties;
  showResponsable: boolean;
  showProgress: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ...gridStyle }}
      data-task-row
      data-row-id={task.id}
      className={cn(
        "grid h-8 cursor-pointer items-center gap-1 border-b px-2 text-xs",
        isSelected && "bg-primary/15 border-l-2 border-l-primary shadow-sm",
        isDragging && "z-10 bg-accent/20 shadow-md",
      )}
      onClick={() => onSelect(task.id)}
      onMouseEnter={() => setHoveredTask(task.id)}
      onMouseLeave={() => setHoveredTask(null)}
    >
      <div className="flex min-w-0 items-center gap-0.5" style={{ paddingLeft: depth * 12 }}>
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-0 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3 w-3" />
        </button>
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(task.id);
            }}
            className="rounded p-0 hover:bg-muted"
          >
            {isCollapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="w-3" />
        )}
        <span className="shrink-0 text-[10px] text-muted-foreground">{number}</span>
        <StatusIcon task={task} />
        <EditableTitle task={task} />
        {task.priority !== "none" && (
          <Flag
            className={cn(
              "h-3 w-3 shrink-0",
              task.priority === "high" && "text-red-500",
              task.priority === "medium" && "text-yellow-500",
              task.priority === "low" && "text-green-500",
            )}
          />
        )}
        {task.comments.length > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground">
            <MessageSquare className="h-2.5 w-2.5" /> {task.comments.length}
          </span>
        )}
        {task.blocks.filter((b) => b.type === "partial").length > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[9px] text-[var(--status-partial)]">
            <AlertTriangle className="h-2.5 w-2.5" />{" "}
            {task.blocks.filter((b) => b.type === "partial").length}
          </span>
        )}
        {task.blocks.filter((b) => b.type === "total").length > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[9px] text-[var(--status-blocked)]">
            <AlertOctagon className="h-2.5 w-2.5" />{" "}
            {task.blocks.filter((b) => b.type === "total").length}
          </span>
        )}
      </div>
      {showResponsable && (
        <div className="truncate text-[11px] text-muted-foreground">{task.assignee || "—"}</div>
      )}
      {showProgress && <div className="text-right text-[11px] font-medium">{task.progress}%</div>}
    </div>
  );
}

function EditableTitle({ task }: { task: Task }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    setDraft(task.title);
  }, [task.title]);

  if (!editing) {
    return (
      <span
        className={cn("truncate", task.progress >= 100 && "text-muted-foreground line-through")}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
      >
        {task.title}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      className="h-5 min-w-0 flex-1 rounded border bg-background px-1 text-xs outline-none ring-1 ring-ring"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== task.title) {
          ganttStore.update(task.id, { title: trimmed });
        } else {
          setDraft(task.title);
        }
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") inputRef.current?.blur();
        if (e.key === "Escape") {
          setDraft(task.title);
          setEditing(false);
        }
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function StatusIcon({ task }: { task: Task }) {
  if (task.progress >= 100)
    return (
      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-complete)]" aria-label="Completada" />
    );
  if (task.blocks.some((b) => b.type === "total"))
    return (
      <AlertOctagon
        className="h-3.5 w-3.5 text-[var(--status-blocked)]"
        aria-label="Bloqueo total"
      />
    );
  if (task.blocks.some((b) => b.type === "partial"))
    return (
      <AlertTriangle
        className="h-3.5 w-3.5 text-[var(--status-partial)]"
        aria-label="Bloqueo parcial"
      />
    );
  return (
    <span
      className="inline-block h-2 w-2 rounded-full bg-[var(--status-progress)]"
      aria-label="En progreso"
    />
  );
}
