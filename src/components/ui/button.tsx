import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Button primitive. Server-safe: it renders a plain `<button>` and carries no
 * client-side state, so pages only opt into `"use client"` when they add handlers.
 */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover border border-transparent",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-muted",
  ghost: "bg-transparent text-ink-muted border border-transparent hover:bg-brand-soft hover:text-ink",
  danger: "bg-critical text-white hover:opacity-90 border border-transparent",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
