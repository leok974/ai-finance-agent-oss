import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "checked"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className = "", checked, onCheckedChange, disabled, ...props }, ref) => {
    return (
      <label className={cn("inline-flex items-center cursor-pointer select-none", disabled && "opacity-50 cursor-not-allowed")}> 
        <input
          ref={ref}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={!!checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          disabled={disabled}
          {...props}
        />
        <span className="h-5 w-9 rounded-full bg-muted relative transition-colors peer-checked:bg-primary">
          <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform peer-checked:translate-x-4" />
        </span>
      </label>
    );
  }
);

Switch.displayName = "Switch";
