import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "danger" | "cyan" | "plain";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(function Button({ className, variant = "primary", ...props }, ref) {
  const styles: Record<Variant, string> = {
    primary:
      "bg-primary text-bg font-medium hover:bg-primary-dim shadow-[0_0_18px_color-mix(in_oklab,var(--color-primary)_28%,transparent)]",
    ghost:
      "bg-transparent text-fg border border-border hover:border-border-strong hover:bg-raised",
    danger: "bg-danger text-fg font-medium hover:opacity-90",
    cyan: "bg-cyan text-bg font-medium hover:opacity-90",
    plain: "bg-raised text-fg border border-border hover:border-border-strong",
  };
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm transition-[color,background-color,border-color,transform] duration-150 ease-out active:not-disabled:scale-[0.96] disabled:opacity-40",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
});
