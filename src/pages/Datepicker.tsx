import { useState } from "react";
import { format, isValid, parse, startOfDay, subDays } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  /** Value in yyyy-MM-dd (same format the API expects) */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disableFuture?: boolean;
  invalid?: boolean;
  className?: string;
  id?: string;
}

const API_FORMAT = "yyyy-MM-dd";

export const DatePicker = ({
  value,
  onChange,
  placeholder = "Pick a date",
  disableFuture,
  invalid,
  className,
  id,
}: DatePickerProps) => {
  const [open, setOpen] = useState(false);

  const parsed = value ? parse(value, API_FORMAT, new Date()) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  const today = startOfDay(new Date());

  const pick = (d: Date) => {
    onChange(format(d, API_FORMAT));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid || undefined}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            invalid && "border-destructive focus-visible:ring-destructive",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {selected ? format(selected, "dd MMM yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => d && pick(d)}
          disabled={disableFuture ? { after: today } : undefined}
        />
        <div className="flex items-center gap-1 border-t border-border p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => pick(today)}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => pick(subDays(today, 1))}
          >
            Yesterday
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
