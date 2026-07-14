import type { Task } from "@/lib/gantt-store";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Plus,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function TaskList({
  order,
  tasks,
  depth,
  collapsed,
  toggleCollapse,
  onSelect,
  onAddSubtask,
  selectedId,
}: {
  order: Task[];
  tasks: Task[];
  depth: Record<string, number>;
  collapsed: Set<string>;
  toggleCollapse: (id: string) => void;
  onSelect: (id: string) => void;
  onAddSubtask: (parentId: string | null) => void;
  selectedId: string | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex h-[40px] items-center justify-between overflow-hidden rounded-md border bg-card px-3">
        <div className="text-sm font-semibold">Tareas</div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => onAddSubtask(null)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Nueva
        </Button>
      </div>
      <div className="rounded-lg border bg-card">
        <div className="grid h-[44px] grid-cols-[1fr_120px_90px_70px] items-center gap-2 border-b bg-muted/80 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <div>Tarea</div>
          <div>Responsable</div>
          <div>Fechas</div>
          <div className="text-right">%</div>
        </div>
        <div className="grid h-[30px] grid-cols-[1fr_120px_90px_70px] items-center gap-2 border-b bg-muted/60 px-3 text-[10px] text-muted-foreground">
          <div>Inicio → Fin</div>
          <div className="truncate">Asignado</div>
          <div>Plan / Real</div>
          <div className="text-right">Progreso</div>
        </div>
        {order.map((task) => {
          const d = depth[task.id] ?? 0;
          const hasChildren = tasks.some((t) => t.parentId === task.id);
          const isCollapsed = collapsed.has(task.id);
          return (
            <div
              key={task.id}
              className={cn(
                "grid h-10 cursor-pointer grid-cols-[1fr_120px_90px_70px] items-center gap-2 border-b px-3 text-sm hover:bg-accent/30",
                selectedId === task.id && "bg-accent/50",
              )}
              onClick={() => onSelect(task.id)}
            >
              <div className="flex min-w-0 items-center gap-1" style={{ paddingLeft: d * 16 }}>
                {hasChildren ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCollapse(task.id);
                    }}
                    className="rounded p-0.5 hover:bg-muted"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                ) : (
                  <span className="w-4" />
                )}
                <StatusIcon task={task} />
                <span
                  className={cn(
                    "truncate",
                    task.progress >= 100 && "text-muted-foreground line-through",
                  )}
                >
                  {task.title}
                </span>
                {task.comments.length > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <MessageSquare className="h-3 w-3" /> {task.comments.length}
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">{task.assignee || "—"}</div>
              <div className="text-[10px] leading-tight text-muted-foreground">
                <div>{task.startDate}</div>
                <div>{task.endDate}</div>
              </div>
              <div className="text-right text-xs font-medium">{task.progress}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusIcon({ task }: { task: Task }) {
  if (task.progress >= 100)
    return (
      <CheckCircle2 className="h-4 w-4 text-[var(--status-complete)]" aria-label="Completada" />
    );
  if (task.block === "total")
    return (
      <AlertOctagon className="h-4 w-4 text-[var(--status-blocked)]" aria-label="Bloqueo total" />
    );
  if (task.block === "partial")
    return (
      <AlertTriangle
        className="h-4 w-4 text-[var(--status-partial)]"
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
