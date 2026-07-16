import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function isWeekendDay(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function DatePicker({
  value,
  onChange,
  min,
  className,
  focusMonth,
}: {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  className?: string;
  focusMonth?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value + "T00:00:00") : undefined;
  const minDate = min ? new Date(min + "T00:00:00") : undefined;
  const defaultMonth = selected ?? (focusMonth ? new Date(focusMonth + "T00:00:00") : undefined);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-7 w-full justify-start text-left font-normal text-xs",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-1.5 h-3 w-3" />
          {value ? format(selected!, "dd MMM yyyy", { locale: es }) : "Seleccionar fecha"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={defaultMonth}
          startMonth={minDate}
          onSelect={(date) => {
            if (date) {
              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, "0");
              const d = String(date.getDate()).padStart(2, "0");
              onChange(`${y}-${m}-${d}`);
            }
            setOpen(false);
          }}
          disabled={(date) => isWeekendDay(date) || (minDate ? date < minDate : false)}
          locale={es}
          weekStartsOn={1}
        />
      </PopoverContent>
    </Popover>
  );
}
