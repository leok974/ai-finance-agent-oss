import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-white/15 " +
      "transition-colors data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-neutral-700 " +
      (className ?? "")
    }
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={
        "pointer-events-none block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform " +
        "data-[state=checked]:translate-x-4"
      }
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = "Switch";
