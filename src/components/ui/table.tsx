import type { ReactNode, ThHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Compact data-table primitives.
 *
 * `TableWrapper` owns the horizontal scroll so a wide table never forces the
 * page body to scroll sideways.
 */

export function TableWrapper({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("w-full overflow-x-auto", className)}>{children}</div>;
}

export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return <table className={cn("w-full min-w-max border-collapse text-sm", className)}>{children}</table>;
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-surface-muted">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function TR({ className, children }: { className?: string; children: ReactNode }) {
  return <tr className={cn("hover:bg-surface-muted", className)}>{children}</tr>;
}

export type THProps = ThHTMLAttributes<HTMLTableCellElement> & { children: ReactNode };

export function TH({ className, children, ...props }: THProps) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-line px-3 py-2 text-left text-xs font-semibold whitespace-nowrap text-ink-muted",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TD({ className, children }: { className?: string; children: ReactNode }) {
  return <td className={cn("px-3 py-2 align-middle text-ink", className)}>{children}</td>;
}
