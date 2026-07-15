import { useState } from "react";
import { store, type Task, type BlockStatus } from "@/lib/gantt-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
import { Trash2, MessageSquarePlus, Plus, CalendarIcon } from "lucide-react";

export function TaskDetail({
  task,
  allTasks,
  onClose,
  onAddSubtask,
  projectStartDate,
}: {
  task: Task;
  allTasks: Task[];
  onClose: () => void;
  onAddSubtask: (parentId: string) => void;
  projectStartDate?: string;
}) {
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentText, setCommentText] = useState("");
  const parent = allTasks.find((t) => t.id === task.parentId);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
      <div className="flex items-start justify-between gap-2">
        {parent && <div className="text-xs text-muted-foreground">Subtarea de: {parent.title}</div>}
        <Button variant="ghost" size="icon" className="ml-auto" onClick={onClose}>
          ×
        </Button>
      </div>

      <div>
        <Label>Nombre</Label>
        <Input
          value={task.title}
          onChange={(e) => store.update(task.id, { title: e.target.value })}
          placeholder="Nombre de la tarea"
        />
      </div>

      <div>
        <Label>Responsable</Label>
        <Input
          value={task.assignee}
          onChange={(e) => store.update(task.id, { assignee: e.target.value })}
          placeholder="Nombre del responsable"
        />
      </div>

      <div className="rounded-md border bg-muted/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Fechas planificadas
          </div>
          {(task.startDate || task.endDate) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => store.update(task.id, { startDate: undefined, endDate: undefined })}
            >
              Limpiar
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Inicio estimado</Label>
            <DatePicker
              value={task.startDate ?? ""}
              min={parent?.startDate ?? projectStartDate}
              onChange={(v) => {
                const patch: Partial<Task> = { startDate: v || undefined };
                if (!v && task.endDate) {
                  patch.endDate = undefined;
                }
                if (v && task.endDate && task.endDate < v) {
                  patch.endDate = undefined;
                }
                store.update(task.id, patch);
              }}
            />
            {parent && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                No puede ser antes del {parent.startDate}
              </p>
            )}
          </div>
          <div>
            <Label>Fin estimado</Label>
            {task.startDate ? (
              <DatePicker
                value={task.endDate ?? ""}
                min={task.startDate}
                focusMonth={task.startDate}
                onChange={(v) => store.update(task.id, { endDate: v || undefined })}
              />
            ) : (
              <Button
                variant="outline"
                className="w-full justify-start font-normal text-muted-foreground"
                disabled
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                Primero indica inicio
              </Button>
            )}
          </div>
        </div>
      </div>

      <Separator />

      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Fechas reales
          </div>
          {(task.actualStartDate || task.actualEndDate) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                store.update(task.id, { actualStartDate: undefined, actualEndDate: undefined })
              }
            >
              Limpiar
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Inicio real</Label>
            <DatePicker
              value={task.actualStartDate ?? ""}
              min={task.startDate}
              onChange={(v) => {
                const patch: Partial<Task> = { actualStartDate: v || undefined };
                if (!v && task.actualEndDate) {
                  patch.actualEndDate = undefined;
                }
                if (v && task.actualEndDate && task.actualEndDate < v) {
                  patch.actualEndDate = undefined;
                }
                store.update(task.id, patch);
              }}
            />
          </div>
          <div>
            <Label>Fin real</Label>
            {task.actualStartDate ? (
              <DatePicker
                value={task.actualEndDate ?? ""}
                min={task.actualStartDate}
                focusMonth={task.actualStartDate}
                onChange={(v) => store.update(task.id, { actualEndDate: v || undefined })}
              />
            ) : (
              <Button
                variant="outline"
                className="w-full justify-start font-normal text-muted-foreground"
                disabled
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                Primero indica inicio
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Se registran cuando la tarea comienza o termina realmente.
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label>Progreso</Label>
          <span className="text-sm font-medium">{task.progress}%</span>
        </div>
        <Slider
          value={[task.progress]}
          max={100}
          step={5}
          onValueChange={([v]) => store.update(task.id, { progress: v })}
        />
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => store.update(task.id, { progress: 0 })}
          >
            Reiniciar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => store.update(task.id, { progress: 100 })}
          >
            Marcar completada
          </Button>
        </div>
      </div>

      <div>
        <Label>Estado de bloqueo</Label>
        <Select
          value={task.block}
          onValueChange={(v) => store.update(task.id, { block: v as BlockStatus })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin bloqueo</SelectItem>
            <SelectItem value="partial">Bloqueo parcial</SelectItem>
            <SelectItem value="total">Bloqueo total</SelectItem>
          </SelectContent>
        </Select>
        {task.block !== "none" && (
          <Textarea
            className="mt-2"
            placeholder="Motivo del bloqueo"
            value={task.blockReason ?? ""}
            onChange={(e) => store.update(task.id, { blockReason: e.target.value })}
          />
        )}
      </div>

      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Comentarios</div>
          <Badge variant="secondary">{task.comments.length}</Badge>
        </div>
        <div className="space-y-2">
          {task.comments.length === 0 && (
            <p className="text-xs text-muted-foreground">Aún no hay comentarios.</p>
          )}
          {task.comments.map((c) => (
            <div key={c.id} className="rounded bg-muted/50 p-2 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{c.author || "Anónimo"}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(c.createdAt).toLocaleString("es")}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          <Input
            placeholder="Tu nombre"
            value={commentAuthor}
            onChange={(e) => setCommentAuthor(e.target.value)}
          />
          <Textarea
            placeholder="Escribe un comentario…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
          />
          <Button
            size="sm"
            onClick={() => {
              if (!commentText.trim()) return;
              store.addComment(task.id, commentAuthor.trim() || "Anónimo", commentText.trim());
              setCommentText("");
            }}
          >
            <MessageSquarePlus className="mr-1 h-4 w-4" /> Añadir comentario
          </Button>
        </div>
      </div>

      <div className="mt-auto flex gap-2 border-t pt-3">
        <Button variant="outline" onClick={() => onAddSubtask(task.id)}>
          <Plus className="mr-1 h-4 w-4" /> Subtarea
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            if (confirm("¿Eliminar tarea y sus subtareas?")) {
              store.remove(task.id);
              onClose();
            }
          }}
        >
          <Trash2 className="mr-1 h-4 w-4" /> Eliminar
        </Button>
      </div>
    </div>
  );
}
