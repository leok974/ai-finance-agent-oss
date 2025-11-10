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
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // Wait for complete page load before rendering portal
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    if (document.readyState === 'complete') {
      setMounted(true);
    } else {
      const onLoad = () => setMounted(true);
      window.addEventListener('load', onLoad);
      return () => window.removeEventListener('load', onLoad);
    }
  }, []);

  // Don't render portal until page is fully loaded
  if (!mounted || !document.body) return null;

  return (
    <PopoverPrimitive.Portal container={getPortalRoot() as any}>
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
