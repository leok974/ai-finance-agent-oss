"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"
import { getPortalRoot } from "@/lib/portal"

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => {
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
    <TooltipPrimitive.Portal container={getPortalRoot() as any}>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "overflow-hidden animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out " +
          "data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 ui-tooltip",
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
})
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
