import * as React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", ...props }, ref) => {
    const base = "inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:pointer-events-none";
    const styles =
      variant === "primary"
        ? "bg-blue-600 hover:bg-blue-500 text-white"
        : variant === "secondary"
        ? "bg-gray-700 hover:bg-gray-600 text-white"
        : "bg-transparent hover:bg-gray-800 text-white";
    return <button ref={ref} className={`${base} ${styles} ${className}`} {...props} />;
  }
);

Button.displayName = "Button";
