import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/** Form primitives. All server-safe; interactivity is added by the consuming page. */

const FIELD_CLASSES =
  "w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink " +
  "placeholder:text-ink-subtle disabled:cursor-not-allowed disabled:bg-surface-muted";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Rendered inside the field on the left — typically a search icon. */
  icon?: ReactNode;
};

export function Input({ className, icon, ...props }: InputProps) {
  if (!icon) {
    return <input className={cn(FIELD_CLASSES, "h-9", className)} {...props} />;
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-ink-subtle">
        {icon}
      </span>
      <input className={cn(FIELD_CLASSES, "h-9 pl-8", className)} {...props} />
    </div>
  );
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select className={cn(FIELD_CLASSES, "h-9 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cn(FIELD_CLASSES, "min-h-20 py-2", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  );
}
