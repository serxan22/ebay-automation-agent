import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export function Button({ children, className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-mint-500 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-ink-950 text-white hover:bg-ink-800 dark:bg-mint-500 dark:text-ink-950",
        variant === "secondary" &&
          "border border-ink-200 bg-white text-ink-800 hover:bg-ink-50 dark:border-white/10 dark:bg-white/5 dark:text-ink-100",
        variant === "ghost" && "text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/10",
        variant === "danger" && "bg-coral-500 text-white hover:bg-coral-700",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
