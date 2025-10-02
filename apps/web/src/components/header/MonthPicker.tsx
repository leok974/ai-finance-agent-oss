import * as React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "lucide-react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  align?: "start" | "center" | "end";
};

export default function MonthPicker({ value, onChange, align = "end" }: Props) {
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState<string>(value ?? "");

  React.useEffect(() => {
    setMonth(value ?? "");
  }, [value]);

  function apply() {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return;
    onChange(month);
    setOpen(false);
  }

  function clear() {
    setMonth("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="pill"
          size="sm"
          className="gap-2 px-3.5 h-9 data-[state=open]:from-emerald-700 data-[state=open]:to-emerald-800 data-[state=open]:text-emerald-50"
          aria-label={month ? `Month ${month}` : "Select month"}
        >
          <Calendar className="h-4 w-4" />
          <span>{month || "Select month"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[240px] p-3 space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.currentTarget.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="pill" size="sm" className="h-8 px-3 text-sm" onClick={clear}>
            Clear
          </Button>
          <Button variant="pill" size="sm" className="h-8 px-3 text-sm" onClick={apply}>
            Set
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
