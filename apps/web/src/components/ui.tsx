import { forwardRef } from "react";

export function cn(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-(--radius-control) px-4 py-[7px] text-sm font-medium",
        "transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]",
        variant === "primary" && "btn-macos text-accent-foreground",
        variant === "ghost" &&
          "text-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]",
        variant === "danger" &&
          "bg-danger text-white shadow-[var(--shadow-btn)] hover:brightness-105",
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-[7px] text-sm",
        "placeholder:text-muted transition-all",
        "focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-[var(--ring)]",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("glass rounded-(--radius-card) p-6 shadow-[var(--shadow-card)]", className)}
      {...props}
    />
  );
}

export function Alert({
  tone,
  className,
  children,
}: {
  tone: "error" | "success" | "warning" | "info";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-(--radius-control) border px-3 py-2 text-sm",
        tone === "error" && "border-danger/30 bg-danger/10 text-danger",
        tone === "success" && "border-success/30 bg-success/10 text-success",
        tone === "warning" && "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
        tone === "info" && "border-accent/30 bg-accent/10 text-accent",
        className,
      )}
    >
      {children}
    </div>
  );
}
