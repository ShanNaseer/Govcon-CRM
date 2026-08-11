"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Modal shell built on the native `<dialog>` element, which supplies focus
 * trapping, the top layer, and Escape-to-close without a dependency.
 *
 * Client Component: it drives imperative DOM methods and keyboard events.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      // `cancel` fires on Escape; closing must go through the parent so its
      // state stays in sync with the element's own open attribute.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
      aria-labelledby="dialog-title"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 id="dialog-title" className="text-sm font-semibold">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-xs text-ink-muted">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="rounded-md p-1 text-ink-subtle hover:bg-canvas hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto px-4 py-4">{children}</div>

      {footer ? (
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>
      ) : null}
    </dialog>
  );
}
