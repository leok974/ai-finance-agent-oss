import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

type Props = {
  value?: { start?: string; end?: string };
  onChange?: (next: { start?: string; end?: string }) => void;
  align?: "start" | "center" | "end";
};

export default function DateRangePicker({ value, onChange, align = "end" }: Props) {
  const [open, setOpen] = React.useState(false);
  const [start, setStart] = React.useState(value?.start ?? "");
  const [end, setEnd] = React.useState(value?.end ?? "");
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    setStart(value?.start ?? "");
    setEnd(value?.end ?? "");
  }, [value?.start, value?.end]);

  function clampAndValidate(s: string, e: string) {
    if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) return "Start must be YYYY-MM-DD";
    if (e && !/^\d{4}-\d{2}-\d{2}$/.test(e)) return "End must be YYYY-MM-DD";
    if (s && e && s > e) return "Start must be before or equal to End";
    return null;
  }

  function apply() {
    const msg = clampAndValidate(start, end);
    setErr(msg);
    if (msg) return;
    onChange?.({ start: start || undefined, end: end || undefined });
    setOpen(false);
  }

  function clear() {
    setStart("");
    setEnd("");
    setErr(null);
    onChange?.({ start: undefined, end: undefined });
    setOpen(false);
  }

  const label =
    start && end ? `${start} → ${end}` :
    start && !end ? `${start} → …` :
    !start && end ? `… → ${end}` :
    "Custom range…";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="pill"
          size="sm"
          className="h-8 px-3 text-xs gap-2"
          aria-label={label}
        >
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          <span>{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[280px] p-3 space-y-3">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Start date</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.currentTarget.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">End date</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.currentTarget.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
        </div>
        {err ? <p className="text-xs text-destructive">{err}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="pill"
            size="sm"
            className="h-8 px-3 text-sm"
            onClick={clear}
          >
            Clear
          </Button>
          <Button
            variant="pill"
            size="sm"
            className="h-8 px-3 text-sm"
            onClick={apply}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
