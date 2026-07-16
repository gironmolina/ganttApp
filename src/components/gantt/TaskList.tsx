import { type Task, store as ganttStore, todayISO } from "@/lib/gantt-store";
import { cn } from "@/lib/utils";
import { computeTimeProgress, parseDate, fmtShort } from "@/lib/gantt-utils";
import {
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Plus,
  MessageSquare,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect, Fragment } from "react";
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

export function TaskList({
  order,
  tasks,
  depth,
  collapsed,
  toggleCollapse,
  onSelect,
  onAddSubtask,
  selectedId,
  projectStart,
  projectEnd,
}: {
  order: Task[];
  tasks: Task[];
  depth: Record<string, number>;
  collapsed: Set<string>;
  toggleCollapse: (id: string) => void;
  onSelect: (id: string) => void;
  onAddSubtask: (parentId: string | null) => void;
  selectedId: string | null;
  projectStart?: string;
  projectEnd?: string;
}) {
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
              hasChildren={tasks.some((t) => t.parentId === task.id)}
              isCollapsed={collapsed.has(task.id)}
              isSelected={selectedId === task.id}
              onToggleCollapse={toggleCollapse}
              onSelect={onSelect}
            />
            {!collapsed.has(task.id) && byParent.has(task.id) && walk(task.id)}
          </Fragment>
        ))}
      </SortableContext>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex h-[40px] items-center justify-between overflow-hidden rounded-md border bg-card px-2">
        <div className="text-xs font-semibold">Tareas</div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[11px]"
          onClick={() => onAddSubtask(null)}
        >
          <Plus className="mr-1 h-3 w-3" /> Nueva
        </Button>
      </div>
      <div className="rounded-lg border bg-card">
        <ProjectTimeBar projectStart={projectStart} projectEnd={projectEnd} />
        <div className="grid h-[30px] grid-cols-[1fr_90px_44px] items-center gap-1 border-b bg-muted/80 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <div>Tarea</div>
          <div>Responsable</div>
          <div className="text-right">%</div>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {walk(null)}
        </DndContext>
      </div>
    </div>
  );
}

function ProjectTimeBar({
  projectStart,
  projectEnd,
}: {
  projectStart?: string;
  projectEnd?: string;
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

  return (
    <div className="flex h-[44px] flex-col justify-center gap-1 border-b bg-muted/40 px-2">
      <div className="flex items-center justify-between text-[9px] text-muted-foreground">
        <span className="font-medium text-foreground">{startLabel}</span>
        <span className="font-semibold text-[var(--status-progress)]">
          {percent}% · {elapsedDays}/{totalDays} días
        </span>
        <span className="font-medium text-foreground">{endLabel}</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--status-progress)]"
          style={{ width: `${percent}%` }}
        />
        {percent > 0 && percent < 100 && (
          <div
            className="absolute inset-y-0 w-px bg-[var(--today)]"
            style={{ left: `${percent}%` }}
          />
        )}
      </div>
    </div>
  );
}

function SortableRow({
  task,
  depth,
  hasChildren,
  isCollapsed,
  isSelected,
  onToggleCollapse,
  onSelect,
}: {
  task: Task;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  isSelected: boolean;
  onToggleCollapse: (id: string) => void;
  onSelect: (id: string) => void;
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
      style={style}
      className={cn(
        "grid h-8 cursor-pointer grid-cols-[1fr_90px_44px] items-center gap-1 border-b px-2 text-xs hover:bg-accent/30",
        isSelected && "bg-accent/50",
        isDragging && "z-10 bg-accent/20 shadow-md",
      )}
      onClick={() => onSelect(task.id)}
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
        <StatusIcon task={task} />
        <EditableTitle task={task} />
        {task.comments.length > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground">
            <MessageSquare className="h-2.5 w-2.5" /> {task.comments.length}
          </span>
        )}
      </div>
      <div className="truncate text-[11px] text-muted-foreground">{task.assignee || "—"}</div>
      <div className="text-right text-[11px] font-medium">{task.progress}%</div>
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
