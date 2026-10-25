import { useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Hours-only TimePicker.
 * value: "HH:mm" (24h, same format the API expects)
 * boundary="start" → HH:00  (e.g. 09:00)
 * boundary="end"   → HH:59  (e.g. 21:59, includes the whole hour)
 */
interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  boundary?: "start" | "end";
  placeholder?: string;
  invalid?: boolean;
  className?: string;
  id?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export const AM_HOURS = Array.from({ length: 12 }, (_, i) => i); // 0..11
export const PM_HOURS = Array.from({ length: 12 }, (_, i) => i + 12); // 12..23

/** hour (0-23) → "9 PM" */
export const formatHour = (h: number) =>
  `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

/** hour (0-23) → API value */
export const hourToValue = (h: number, boundary: "start" | "end" = "start") =>
  `${pad(h)}:${boundary === "end" ? "59" : "00"}`;

/** "HH:mm" → hour number (or null) */
export const valueToHour = (v: string): number | null => {
  const m = /^([01]\d|2[0-3]):[0-5]\d/.exec(v || "");
  return m ? Number(m[1]) : null;
};

/** 24h "HH:mm" → "09:00 PM" */
export const formatTime12 = (v: string) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(v || "");
  if (!m) return "";
  const h = Number(m[1]);
  return `${pad(h % 12 || 12)}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
};

export const TimePicker = ({
  value,
  onChange,
  boundary = "start",
  placeholder = "Pick a time",
  invalid,
  className,
  id,
}: TimePickerProps) => {
  const [open, setOpen] = useState(false);
  const selected = valueToHour(value);

  const pick = (h: number) => {
    onChange(hourToValue(h, boundary));
    setOpen(false);
  };

  const cell = (active: boolean) =>
    cn(
      "h-9 rounded-lg text-[13px] font-semibold tabular-nums transition-all",
      active
        ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
        : "text-foreground hover:bg-muted",
    );

  const Group = ({ label, hours }: { label: string; hours: number[] }) => (
    <div>
      <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="grid grid-cols-6 gap-1">
        {hours.map((h) => (
          <button
            key={h}
            type="button"
            className={cell(selected === h)}
            onClick={() => pick(h)}
          >
            {h % 12 || 12}
          </button>
        ))}
      </div>
    </div>
  );

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
            selected === null && "text-muted-foreground",
            invalid && "border-destructive focus-visible:ring-destructive",
            className,
          )}
        >
          <Clock className="mr-2 h-4 w-4 shrink-0" />
          {selected !== null ? formatTime12(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {boundary === "end" ? "End hour" : "Start hour"}
          </span>
          <span className="text-lg font-bold tabular-nums">
            {selected !== null ? formatTime12(value) : "--:--"}
          </span>
        </div>
        <div className="space-y-3 p-3">
          <Group label="AM · Morning" hours={AM_HOURS} />
          <Group label="PM · Afternoon & Night" hours={PM_HOURS} />
        </div>
        <div className="flex items-center gap-1 border-t border-border p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => pick(new Date().getHours())}
          >
            Now
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => pick(0)}
          >
            Start of day
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => pick(23)}
          >
            End of day
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
