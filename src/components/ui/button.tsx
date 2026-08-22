import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Button primitive. Server-safe: it renders a plain `<button>` and carries no
 * client-side state, so pages only opt into `"use client"` when they add handlers.
 */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover border border-transparent",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-muted",
  ghost: "bg-transparent text-ink-muted border border-transparent hover:bg-brand-soft hover:text-ink",
  danger: "bg-critical text-white hover:opacity-90 border border-transparent",
};

/** Heights and padding match the design's button scale. */
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-sm",
  md: "h-9 gap-2 px-4 text-sm",
  lg: "h-10 gap-2 px-6 text-sm",
};

const BASE_CLASSES =
  "inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap " +
  "transition-colors disabled:pointer-events-none disabled:opacity-50 " +
  // The design sizes any icon child to 16px and stops it shrinking, so a label
  // and its icon stay aligned without per-call-site classes.
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

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
      className={cn(BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

export type ButtonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

/**
 * A navigation control that looks like a button.
 *
 * Kept separate from `Button` rather than added as an `asChild` escape hatch: an
 * action that navigates is an anchor, and rendering it as one keeps middle-click,
 * open-in-new-tab and prefetch working.
 */
export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={cn(BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className)}
      {...props}
    >
      {children}
    </Link>
  );
}
