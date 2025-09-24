import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap select-none transition-transform transform-gpu",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",

        // ---- PILL FAMILY ----
        pill: [
          "rounded-full h-8 px-3 text-sm",
          "bg-gradient-to-b from-zinc-800 to-zinc-900",
          "text-zinc-100/90 border border-white/10",
          "shadow-[inset_0_1px_0_0_rgba(255,255,255,.06),0_6px_16px_-8px_rgba(0,0,0,.6)]",
          "hover:from-zinc-750 hover:to-zinc-900/95 hover:text-white",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
          "data-[state=open]:from-emerald-700 data-[state=open]:to-emerald-800 data-[state=open]:text-emerald-50",
          "active:translate-y-[0.5px]",
        ].join(" "),
        "pill-outline": [
          "rounded-full h-8 px-3 text-sm",
          "bg-transparent text-zinc-200",
          "border border-white/15 hover:bg-white/[.04]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50",
        ].join(" "),
        "pill-primary": [
          "rounded-full h-9 px-4 text-sm",
          "bg-emerald-600 text-white hover:bg-emerald-500",
          "border border-emerald-400/20 shadow",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70",
        ].join(" "),
        "pill-success": [
          "rounded-full h-8 px-3 text-sm",
          "bg-emerald-700/80 text-emerald-50 hover:bg-emerald-700",
          "border border-emerald-400/30",
        ].join(" "),
        "pill-danger": [
          "rounded-full h-8 px-3 text-sm",
          "bg-rose-700/85 text-rose-50 hover:bg-rose-700",
          "border border-rose-400/30",
        ].join(" "),
        "pill-ghost": [
          "rounded-full h-8 px-3 text-sm",
          "bg-transparent text-zinc-300 hover:bg-white/[.04]",
        ].join(" "),
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4 text-sm",
        lg: "h-10 px-5 text-sm",
        icon: "h-8 w-8 p-0",
      },
    },
    defaultVariants: { variant: "pill", size: "sm" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };

/** Handy class for icon-only pills (non-Button elements) */
export const pillIconClass =
  "inline-flex items-center justify-center rounded-full h-8 w-8 bg-gradient-to-b from-zinc-800 to-zinc-900 text-zinc-100/90 border border-white/10 hover:from-zinc-750 hover:to-zinc-900/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60";
