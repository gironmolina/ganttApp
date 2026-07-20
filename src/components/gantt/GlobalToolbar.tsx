import { store, getTasks } from "@/lib/gantt-store";
import { settingsStore } from "@/lib/settings-store";
import {
  openProjectFile,
  saveProjectFile,
  clearLocalStorage,
  clearFileState,
  useLastSavedAt,
} from "@/lib/json-persist";
import { useIsDirty, markClean } from "@/lib/dirty-store";
import { FolderOpen, Save, FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatLastSaved(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Último guardado: ${date}, ${time}`;
}

export function GlobalToolbar() {
  const dirty = useIsDirty();
  const lastSavedAt = useLastSavedAt();

  const handleOpen = async () => {
    const data = await openProjectFile();
    if (!data) return;
    store.loadProject(data);
    settingsStore.loadProject(data);
    markClean();
  };

  const handleSave = async () => {
    const tasks = getTasks();
    const settingsRaw = localStorage.getItem("gantt-settings-v1");
    const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
    const projectName = settings.name || "Proyecto";
    const ok = await saveProjectFile({ tasks, settings }, projectName);
    if (ok) markClean();
  };

  const handleNew = () => {
    if (!confirm("¿Crear un proyecto nuevo? Se perderán los cambios no guardados.")) return;
    clearLocalStorage();
    clearFileState();
    localStorage.removeItem("gantt-tasks-v3");
    localStorage.removeItem("gantt-settings-v1");
    store.loadProject({ tasks: [], settings: {} });
    settingsStore.loadProject({ tasks: [], settings: {} });
    markClean();
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant="ghost"
        className="h-6 gap-1 px-1.5 text-[10px]"
        onClick={handleOpen}
      >
        <FolderOpen className="h-3 w-3" />
        Abrir
      </Button>
      <Button
        size="sm"
        variant={dirty ? "default" : "ghost"}
        className="h-6 gap-1 px-1.5 text-[10px]"
        onClick={handleSave}
      >
        <Save className="h-3 w-3" />
        Guardar
        {dirty && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 gap-1 px-1.5 text-[10px]"
        onClick={handleNew}
      >
        <FilePlus className="h-3 w-3" />
        Nuevo
      </Button>
      <span className="text-[10px] text-muted-foreground">
        {dirty ? (
          <span className="flex items-center gap-1 text-[var(--status-delayed)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--status-delayed)]" />
            Cambios sin guardar
          </span>
        ) : lastSavedAt ? (
          formatLastSaved(lastSavedAt)
        ) : null}
      </span>
    </div>
  );
}
