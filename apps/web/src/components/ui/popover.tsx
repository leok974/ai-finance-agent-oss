"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";
import { getPortalRoot } from "@/lib/portal";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverClose = PopoverPrimitive.Close;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => {
  // In iframe context, skip Portal wrapper - everything is already isolated
  // Radix Portal doesn't work across document boundaries even with same-origin
  const isIframe = window !== window.parent;

  if (isIframe) {
    return (
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-xl border border-border bg-card p-3 shadow-md outline-none",
          className
        )}
        {...props}
      />
    );
  }

  // Main app uses portal to avoid z-index conflicts
  const portalRoot = getPortalRoot();
  if (!portalRoot) {
    console.warn('[popover] no portal root available');
    return null;
  }

  return (
    <PopoverPrimitive.Portal container={portalRoot as any}>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-xl border border-border bg-card p-3 shadow-md outline-none",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverClose };
