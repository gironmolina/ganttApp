import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { settingsStore, type ProjectSettings } from "@/lib/settings-store";
import { DatePicker } from "./DatePicker";

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  settings: ProjectSettings;
}) {
  const [name, setName] = useState(settings.name);
  const [startDate, setStartDate] = useState(settings.startDate);
  const [endDate, setEndDate] = useState(settings.endDate);

  useEffect(() => {
    if (open) {
      setName(settings.name);
      setStartDate(settings.startDate);
      setEndDate(settings.endDate);
    }
  }, [open, settings]);

  const save = () => {
    settingsStore.update({
      name: name.trim() || "Proyecto",
      startDate,
      endDate: endDate < startDate ? startDate : endDate,
    });
    onOpenChange(false);
  };

  const days = Math.max(
    0,
    Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustes del proyecto</DialogTitle>
          <DialogDescription>Cambia el nombre y la duración total del proyecto.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Nombre del proyecto</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mi proyecto"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="project-start">Inicio</Label>
              <DatePicker value={startDate} onChange={setStartDate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-end">Fin</Label>
              <DatePicker value={endDate} onChange={setEndDate} min={startDate} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Duración planificada:{" "}
            <span className="font-medium text-foreground">{days} días naturales</span>
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
