import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <label className="inline-flex items-center gap-2">
    <CheckboxPrimitive.Root
      ref={ref}
      className={
        "h-4 w-4 rounded border border-white/20 bg-neutral-800 " +
        "data-[state=checked]:bg-emerald-600"
      }
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <svg viewBox="0 0 20 20" className="h-4 w-4 fill-white">
          <path d="M7.629 13.233 3.9 9.504l1.314-1.314 2.415 2.415L14.786 3.45l1.314 1.314z" />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
    {children}
  </label>
));
Checkbox.displayName = "Checkbox";
