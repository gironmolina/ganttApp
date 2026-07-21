import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import {
  store,
  type Task,
  type BlockRange,
  type Priority,
  type DependencyType,
} from "@/lib/gantt-store";
import { countWorkdays } from "@/lib/gantt-utils";
import {
  validateDependency,
  findDependenciesBrokenByEdit,
  type BrokenDependency,
} from "@/lib/critical-path";
import { useCollapsedSections, toggleSection, isSectionCollapsed } from "@/lib/section-collapse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { DatePicker } from "./DatePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronRight,
  ChevronDown,
  Trash2,
  MessageSquarePlus,
  Plus,
  CalendarIcon,
} from "lucide-react";

export function TaskDetail({
  task,
  allTasks,
  numbers,
  onClose,
  onAddSubtask,
  projectStartDate,
}: {
  task: Task;
  allTasks: Task[];
  numbers?: Record<string, string>;
  onClose: () => void;
  onAddSubtask: (parentId: string) => void;
  projectStartDate?: string;
}) {
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentText, setCommentText] = useState("");
  useCollapsedSections();
  const [newDepType, setNewDepType] = useState<DependencyType>("FS");
  const [isAddingDependency, setIsAddingDependency] = useState(false);
  const addDependencyFormRef = useRef<HTMLDivElement>(null);
  const [pendingDateChange, setPendingDateChange] = useState<{
    patch: Partial<Task>;
    broken: BrokenDependency[];
  } | null>(null);
  const parent = allTasks.find((t) => t.id === task.parentId);

  // Cierra el formulario de "añadir dependencia" al hacer click fuera de él.
  // Si el click además cae fuera del sidebar, el listener de GanttPage se
  // encarga de cerrar todo el panel; si cae dentro del sidebar, solo se
  // colapsa este formulario y el panel sigue abierto.
  useEffect(() => {
    if (!isAddingDependency) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        document.body.style.pointerEvents === "none" &&
        !target.closest("[data-radix-popper-content-wrapper]")
      ) {
        return;
      }
      if (addDependencyFormRef.current?.contains(target)) return;
      if (target.closest("[data-radix-popper-content-wrapper]")) return;
      setIsAddingDependency(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isAddingDependency]);

  const isCollapsed = isSectionCollapsed;

  // Cualquier edición de fecha pasa por aquí: si rompe una dependencia ya
  // creada (deja de cumplir la regla de su tipo), pide confirmación antes de
  // aplicar el cambio y eliminar esa dependencia.
  const commitDateChange = (patch: Partial<Task>) => {
    const broken = findDependenciesBrokenByEdit(allTasks, task.id, patch);
    if (broken.length === 0) {
      store.update(task.id, patch);
      return;
    }
    setPendingDateChange({ patch, broken });
  };

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => onAddSubtask(task.id)}
          >
            <Plus className="mr-1 h-3 w-3" /> Subtarea
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 px-2 text-xs"
            onClick={() => {
              if (confirm("¿Eliminar tarea y sus subtareas?")) {
                store.remove(task.id);
                onClose();
              }
            }}
          >
            <Trash2 className="mr-1 h-3 w-3" /> Eliminar
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {parent && (
            <div className="text-[10px] text-muted-foreground">Subtarea de: {parent.title}</div>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-sm" onClick={onClose}>
            ×
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-[10px]">Nombre</Label>
        <Input
          className="h-7 text-xs"
          value={task.title}
          onChange={(e) => store.update(task.id, { title: e.target.value })}
          placeholder="Nombre de la tarea"
        />
      </div>

      <div>
        <Label className="text-[10px]">Responsable</Label>
        <Input
          className="h-7 text-xs"
          value={task.assignee}
          onChange={(e) => store.update(task.id, { assignee: e.target.value })}
          placeholder="Nombre del responsable"
        />
      </div>

      <div>
        <Label className="text-[10px]">Prioridad</Label>
        <Select
          value={task.priority}
          onValueChange={(v) => store.update(task.id, { priority: v as Priority })}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="high">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                Alta
              </span>
            </SelectItem>
            <SelectItem value="medium">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
                Media
              </span>
            </SelectItem>
            <SelectItem value="low">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                Baja
              </span>
            </SelectItem>
            <SelectItem value="none">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-gray-300" />
                Ninguna
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label className="text-[10px]">Progreso</Label>
          <span className="text-xs font-medium">{task.progress}%</span>
        </div>
        <Slider
          value={[task.progress]}
          max={100}
          step={5}
          onValueChange={([v]) => store.update(task.id, { progress: v })}
        />
        <div className="mt-1 flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px]"
            onClick={() => store.update(task.id, { progress: 0 })}
          >
            Reiniciar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px]"
            onClick={() => store.update(task.id, { progress: 100 })}
          >
            Completada
          </Button>
        </div>
      </div>

      {/* Fechas section */}
      <div className="rounded border bg-muted/40">
        <button
          className="flex w-full items-center gap-1 px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/60"
          onClick={() => toggleSection("fechas")}
        >
          {isCollapsed("fechas") ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          Fechas
        </button>
        {!isCollapsed("fechas") && (
          <div className="space-y-2 px-2 pb-2">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[9px] font-medium uppercase text-muted-foreground">
                  Planificación inicial
                </div>
                {(task.initialStartDate || task.initialEndDate) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-4 px-1 text-[9px]"
                    onClick={() =>
                      commitDateChange({
                        initialStartDate: undefined,
                        initialEndDate: undefined,
                      })
                    }
                  >
                    Limpiar
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[9px]">Inicio inicial</Label>
                  <DatePicker
                    value={task.initialStartDate ?? ""}
                    min={parent?.initialStartDate ?? projectStartDate}
                    onChange={(v) => {
                      const patch: Partial<Task> = { initialStartDate: v || undefined };
                      if (!v && task.initialEndDate) {
                        patch.initialEndDate = undefined;
                      }
                      if (v && task.initialEndDate && task.initialEndDate < v) {
                        patch.initialEndDate = undefined;
                      }
                      commitDateChange(patch);
                    }}
                  />
                </div>
                <div>
                  <Label className="text-[9px]">Fin inicial</Label>
                  {task.initialStartDate ? (
                    <DatePicker
                      value={task.initialEndDate ?? ""}
                      min={task.initialStartDate}
                      focusMonth={task.initialStartDate}
                      onChange={(v) => commitDateChange({ initialEndDate: v || undefined })}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      className="h-7 w-full justify-start font-normal text-[10px] text-muted-foreground"
                      disabled
                    >
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      Primero inicio
                    </Button>
                  )}
                </div>
              </div>
              {task.initialStartDate && task.initialEndDate && (
                <p className="text-[9px] text-muted-foreground">
                  {(() => {
                    const d = countWorkdays(task.initialStartDate, task.initialEndDate);
                    return `${d} ${d === 1 ? "día" : "días"}`;
                  })()}
                </p>
              )}
            </div>

            <div className="border-b" />

            <div>
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[9px] font-medium uppercase text-muted-foreground">
                  Estimadas
                </div>
                {(task.estimatedStartDate || task.estimatedEndDate) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-4 px-1 text-[9px]"
                    onClick={() =>
                      commitDateChange({
                        estimatedStartDate: undefined,
                        estimatedEndDate: undefined,
                      })
                    }
                  >
                    Limpiar
                  </Button>
                )}
              </div>
              {!task.initialStartDate || !task.initialEndDate ? (
                <p className="py-1 text-[10px] text-muted-foreground">
                  Primero define las fechas de planificación inicial.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[9px]">Inicio estimada</Label>
                    <DatePicker
                      value={task.estimatedStartDate ?? ""}
                      min={
                        parent?.estimatedStartDate ?? parent?.initialStartDate ?? projectStartDate
                      }
                      onChange={(v) => {
                        const patch: Partial<Task> = { estimatedStartDate: v || undefined };
                        if (!v && task.estimatedEndDate) {
                          patch.estimatedEndDate = undefined;
                        }
                        if (v && task.estimatedEndDate && task.estimatedEndDate < v) {
                          patch.estimatedEndDate = undefined;
                        }
                        commitDateChange(patch);
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-[9px]">Fin estimada</Label>
                    {task.estimatedStartDate ? (
                      <DatePicker
                        value={task.estimatedEndDate ?? ""}
                        min={task.estimatedStartDate}
                        focusMonth={task.estimatedStartDate}
                        onChange={(v) => commitDateChange({ estimatedEndDate: v || undefined })}
                      />
                    ) : (
                      <Button
                        variant="outline"
                        className="h-7 w-full justify-start font-normal text-[10px] text-muted-foreground"
                        disabled
                      >
                        <CalendarIcon className="mr-1 h-3 w-3" />
                        Primero inicio
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {task.estimatedStartDate && task.estimatedEndDate && (
                <p className="text-[9px] text-muted-foreground">
                  {(() => {
                    const d = countWorkdays(task.estimatedStartDate, task.estimatedEndDate);
                    return `${d} ${d === 1 ? "día" : "días"}`;
                  })()}
                </p>
              )}
            </div>

            <div className="border-b" />

            <div>
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[9px] font-medium uppercase text-muted-foreground">Reales</div>
                {(task.actualStartDate || task.actualEndDate) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-4 px-1 text-[9px]"
                    onClick={() =>
                      commitDateChange({
                        actualStartDate: undefined,
                        actualEndDate: undefined,
                      })
                    }
                  >
                    Limpiar
                  </Button>
                )}
              </div>
              {!task.estimatedStartDate || !task.estimatedEndDate ? (
                <p className="py-1 text-[10px] text-muted-foreground">
                  Primero define las fechas estimadas.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[9px]">Inicio real</Label>
                    <DatePicker
                      value={task.actualStartDate ?? ""}
                      min={task.estimatedStartDate}
                      focusMonth={task.estimatedStartDate ?? projectStartDate}
                      onChange={(v) => {
                        const patch: Partial<Task> = { actualStartDate: v || undefined };
                        if (!v && task.actualEndDate) {
                          patch.actualEndDate = undefined;
                        }
                        if (v && task.actualEndDate && task.actualEndDate < v) {
                          patch.actualEndDate = undefined;
                        }
                        commitDateChange(patch);
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-[9px]">Fin real</Label>
                    {task.actualStartDate ? (
                      <DatePicker
                        value={task.actualEndDate ?? ""}
                        min={task.actualStartDate}
                        focusMonth={task.actualStartDate}
                        onChange={(v) => commitDateChange({ actualEndDate: v || undefined })}
                      />
                    ) : (
                      <Button
                        variant="outline"
                        className="h-7 w-full justify-start font-normal text-[10px] text-muted-foreground"
                        disabled
                      >
                        <CalendarIcon className="mr-1 h-3 w-3" />
                        Primero inicio
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {task.actualStartDate && task.actualEndDate && (
                <p className="text-[9px] text-muted-foreground">
                  {(() => {
                    const d = countWorkdays(task.actualStartDate, task.actualEndDate);
                    return `${d} ${d === 1 ? "día" : "días"}`;
                  })()}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dependencias section */}
      <div className="rounded border">
        <button
          className="flex w-full items-center gap-1 px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/60"
          onClick={() => toggleSection("dependencias")}
        >
          {isCollapsed("dependencias") ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          Dependencias
          <Badge variant="secondary" className="ml-1 h-3.5 px-1 text-[8px]">
            {task.dependencies.length}
          </Badge>
          {!isCollapsed("dependencias") && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-5 px-1.5 text-[9px]"
              onClick={(e) => {
                e.stopPropagation();
                setIsAddingDependency(true);
              }}
            >
              <Plus className="mr-0.5 h-2.5 w-2.5" /> Añadir
            </Button>
          )}
        </button>
        {!isCollapsed("dependencias") && (
          <div className="space-y-1.5 px-2 pb-2">
            {task.dependencies.length === 0 && !isAddingDependency && (
              <p className="text-[10px] text-muted-foreground">Sin dependencias.</p>
            )}
            {task.dependencies.map((dep) => {
              const pred = allTasks.find((t) => t.id === dep.predecessorId);
              return (
                <div
                  key={dep.id}
                  className="flex items-center gap-1.5 rounded border bg-muted/30 p-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-[10px]" title={pred?.title}>
                    {pred?.title ?? "(tarea eliminada)"}
                  </span>
                  <Select
                    value={dep.type}
                    onValueChange={(v) =>
                      store.updateDependency(task.id, dep.id, v as DependencyType)
                    }
                  >
                    <SelectTrigger className="h-6 w-[132px] text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FS" className="text-[10px]">
                        FS · Fin → Inicio
                      </SelectItem>
                      <SelectItem value="FF" className="text-[10px]">
                        FF · Fin → Fin
                      </SelectItem>
                      <SelectItem value="SS" className="text-[10px]">
                        SS · Inicio → Inicio
                      </SelectItem>
                      <SelectItem value="SF" className="text-[10px]">
                        SF · Inicio → Fin
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-xs"
                    onClick={() => store.removeDependency(task.id, dep.id)}
                  >
                    ×
                  </Button>
                </div>
              );
            })}
            {isAddingDependency &&
              (() => {
                const candidates = allTasks.filter(
                  (t) =>
                    t.id !== task.id && !task.dependencies.some((d) => d.predecessorId === t.id),
                );
                return (
                  <div
                    ref={addDependencyFormRef}
                    className="flex items-center gap-1.5 rounded border bg-muted/30 p-1.5"
                  >
                    <Select
                      value={newDepType}
                      onValueChange={(v) => setNewDepType(v as DependencyType)}
                    >
                      <SelectTrigger className="h-7 w-[128px] shrink-0 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FS" className="text-[10px]">
                          FS · Fin → Inicio
                        </SelectItem>
                        <SelectItem value="FF" className="text-[10px]">
                          FF · Fin → Fin
                        </SelectItem>
                        <SelectItem value="SS" className="text-[10px]">
                          SS · Inicio → Inicio
                        </SelectItem>
                        <SelectItem value="SF" className="text-[10px]">
                          SF · Inicio → Fin
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {candidates.length === 0 ? (
                      <p className="flex-1 text-[10px] text-muted-foreground">
                        No hay tareas que apliquen.
                      </p>
                    ) : (
                      <Select
                        value=""
                        onValueChange={(predId) => {
                          const res = validateDependency(allTasks, task.id, predId, newDepType);
                          if (!res.ok) {
                            toast.error(res.reason);
                            return;
                          }
                          store.addDependency(task.id, predId, newDepType);
                          setIsAddingDependency(false);
                        }}
                      >
                        <SelectTrigger className="h-7 flex-1 text-[10px]">
                          <SelectValue placeholder="Elegir tarea predecesora..." />
                        </SelectTrigger>
                        <SelectContent>
                          {candidates.map((t) => (
                            <SelectItem key={t.id} value={t.id} className="text-[10px]">
                              {numbers?.[t.id] ? `${numbers[t.id]} · ${t.title}` : t.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })()}
          </div>
        )}
      </div>

      {/* Bloqueos section */}
      <div className="rounded border">
        <button
          className="flex w-full items-center gap-1 px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/60"
          onClick={() => toggleSection("bloqueos")}
        >
          {isCollapsed("bloqueos") ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          Bloqueos
          <Badge variant="secondary" className="ml-1 h-3.5 px-1 text-[8px]">
            {task.blocks.length}
          </Badge>
          {!isCollapsed("bloqueos") && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-5 px-1.5 text-[9px]"
              onClick={(e) => {
                e.stopPropagation();
                const uid = Math.random().toString(36).slice(2, 10);
                const defaultStart = task.estimatedStartDate ?? task.initialStartDate ?? "";
                store.update(task.id, {
                  blocks: [
                    ...task.blocks,
                    { id: uid, type: "partial", startDate: defaultStart, endDate: defaultStart },
                  ],
                });
              }}
            >
              <Plus className="mr-0.5 h-2.5 w-2.5" /> Añadir
            </Button>
          )}
        </button>
        {!isCollapsed("bloqueos") && (
          <div className="px-2 pb-2">
            {task.blocks.length === 0 && (
              <p className="text-[10px] text-muted-foreground">Sin bloqueos registrados.</p>
            )}
            <div className="space-y-1.5">
              {task.blocks.map((block) => (
                <div key={block.id} className="space-y-1 rounded border bg-muted/30 p-1.5">
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={block.type}
                      onValueChange={(v) => {
                        store.update(task.id, {
                          blocks: task.blocks.map((b) =>
                            b.id === block.id ? { ...b, type: v as "partial" | "total" } : b,
                          ),
                        });
                      }}
                    >
                      <SelectTrigger className="h-6 w-24 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="partial">Parcial</SelectItem>
                        <SelectItem value="total">Total</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-6 w-6 p-0 text-xs"
                      onClick={() =>
                        store.update(task.id, {
                          blocks: task.blocks.filter((b) => b.id !== block.id),
                        })
                      }
                    >
                      ×
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <Label className="text-[9px]">Inicio bloqueo</Label>
                      <DatePicker
                        value={block.startDate}
                        min={
                          block.type === "partial"
                            ? (task.estimatedStartDate ?? task.initialStartDate ?? projectStartDate)
                            : projectStartDate
                        }
                        onChange={(v) => {
                          store.update(task.id, {
                            blocks: task.blocks.map((b) =>
                              b.id === block.id
                                ? {
                                    ...b,
                                    startDate: v,
                                    endDate: v && b.endDate && b.endDate < v ? v : b.endDate,
                                  }
                                : b,
                            ),
                          });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-[9px]">Fin bloqueo</Label>
                      {block.startDate ? (
                        <DatePicker
                          value={block.endDate}
                          min={block.startDate}
                          focusMonth={block.startDate}
                          onChange={(v) => {
                            store.update(task.id, {
                              blocks: task.blocks.map((b) =>
                                b.id === block.id ? { ...b, endDate: v } : b,
                              ),
                            });
                          }}
                        />
                      ) : (
                        <Button
                          variant="outline"
                          className="h-7 w-full justify-start font-normal text-[10px] text-muted-foreground"
                          disabled
                        >
                          <CalendarIcon className="mr-1 h-3 w-3" />
                          Primero inicio
                        </Button>
                      )}
                    </div>
                  </div>
                  {block.startDate && block.endDate && (
                    <p className="text-[9px] text-muted-foreground">
                      {(() => {
                        const d = countWorkdays(block.startDate, block.endDate);
                        return `${d} ${d === 1 ? "día" : "días"}`;
                      })()}
                    </p>
                  )}
                  <Input
                    className="h-6 text-[10px]"
                    placeholder="Motivo del bloqueo (opcional)"
                    value={block.reason ?? ""}
                    onChange={(e) => {
                      store.update(task.id, {
                        blocks: task.blocks.map((b) =>
                          b.id === block.id ? { ...b, reason: e.target.value || undefined } : b,
                        ),
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Comentarios section */}
      <div className="rounded border">
        <button
          className="flex w-full items-center gap-1 px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/60"
          onClick={() => toggleSection("comentarios")}
        >
          {isCollapsed("comentarios") ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          Comentarios
          <Badge variant="secondary" className="ml-1 h-3.5 px-1 text-[8px]">
            {task.comments.length}
          </Badge>
        </button>
        {!isCollapsed("comentarios") && (
          <div className="px-2 pb-2">
            <div className="space-y-1">
              {task.comments.length === 0 && (
                <p className="text-[10px] text-muted-foreground">Aún no hay comentarios.</p>
              )}
              {task.comments.map((c) => (
                <CommentItem key={c.id} comment={c} taskId={task.id} />
              ))}
            </div>
            <div className="mt-2 space-y-1">
              <Input
                className="h-6 text-[10px]"
                placeholder="Tu nombre"
                value={commentAuthor}
                onChange={(e) => setCommentAuthor(e.target.value)}
              />
              <Textarea
                className="min-h-[48px] text-[10px]"
                placeholder="Escribe un comentario…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-5 px-1.5 text-[9px]"
                  onClick={() => {
                    if (!commentText.trim()) return;
                    store.addComment(
                      task.id,
                      commentAuthor.trim() || "Anónimo",
                      commentText.trim(),
                    );
                    setCommentText("");
                  }}
                >
                  <Plus className="mr-0.5 h-2.5 w-2.5" /> Añadir
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <AlertDialog
        open={!!pendingDateChange}
        onOpenChange={(open) => !open && setPendingDateChange(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Esto eliminará {pendingDateChange?.broken.length ?? 0}{" "}
              {(pendingDateChange?.broken.length ?? 0) === 1 ? "dependencia" : "dependencias"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Este cambio de fecha hace que las siguientes dependencias dejen de cumplir su regla.
              Si continúas, se eliminarán:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-1 text-xs">
            {pendingDateChange?.broken.map((b) => (
              <li key={b.dependencyId} className="rounded border bg-muted/30 px-2 py-1">
                <span className="font-medium">{b.predecessorTitle}</span> →{" "}
                <span className="font-medium">{b.successorTitle}</span>{" "}
                <span className="text-muted-foreground">({b.type})</span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDateChange(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDateChange) return;
                store.update(task.id, pendingDateChange.patch);
                for (const b of pendingDateChange.broken) {
                  store.removeDependency(b.successorId, b.dependencyId);
                }
                setPendingDateChange(null);
              }}
            >
              Confirmar y eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CommentItem({
  comment,
  taskId,
}: {
  comment: { id: string; author: string; text: string; createdAt: string };
  taskId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  useEffect(() => {
    setDraft(comment.text);
  }, [comment.text]);

  return (
    <div className="group rounded bg-muted/50 p-1.5 text-xs">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-medium">{comment.author || "Anónimo"}</span>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground">
            {new Date(comment.createdAt).toLocaleString("es")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 text-[9px] opacity-0 group-hover:opacity-100"
            onClick={() => setEditing(true)}
          >
            ✎
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 text-[9px] opacity-0 group-hover:opacity-100 text-destructive"
            onClick={() => store.deleteComment(taskId, comment.id)}
          >
            ×
          </Button>
        </div>
      </div>
      {editing ? (
        <Textarea
          ref={ref}
          className="mt-0.5 min-h-[32px] text-[10px]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const trimmed = draft.trim();
            if (trimmed && trimmed !== comment.text) {
              store.updateComment(taskId, comment.id, trimmed);
            } else {
              setDraft(comment.text);
            }
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(comment.text);
              setEditing(false);
            }
          }}
        />
      ) : (
        <p
          className="mt-0.5 cursor-text whitespace-pre-wrap text-[10px]"
          onDoubleClick={() => setEditing(true)}
        >
          {comment.text}
        </p>
      )}
    </div>
  );
}
