import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Keep existing visual defaults for current usages, add cva variants + pill
const buttonVariants = cva(
  // base
  "inline-flex items-center justify-center whitespace-nowrap select-none px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        // map existing variants
        default: "bg-blue-600 hover:bg-blue-500 text-white",
        primary: "bg-blue-600 hover:bg-blue-500 text-white",
        secondary: "bg-gray-700 hover:bg-gray-600 text-white",
        ghost: "bg-transparent hover:bg-gray-800 text-white",

        // new glossy “pill” chip
        pill: [
          "rounded-full px-3 h-8",
          "bg-gradient-to-b from-zinc-800 to-zinc-900",
          "text-zinc-100/90",
          "border border-white/10",
          "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_6px_16px_-8px_rgba(0,0,0,0.6)]",
          "transition transform-gpu",
          "hover:from-zinc-750 hover:to-zinc-900/95 hover:text-white",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-0",
          "active:translate-y-[0.5px] active:brightness-[.98]",
          "data-[active=true]:from-emerald-700 data-[active=true]:to-emerald-800 data-[active=true]:text-emerald-50",
        ].join(" "),
      },
      size: {
        // provide sm to match pill nicely; no default to avoid regressions
        sm: "h-8 px-3 text-xs",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  active?: boolean; // allow an active style (for pill)
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, active, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref as any}
        data-active={active ? "true" : "false"}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
