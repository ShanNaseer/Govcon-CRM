"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, LogOut, Settings, User } from "lucide-react";

import { signOut } from "@/app/login/actions";
import { cn, deriveInitials } from "@/lib/utils";

/**
 * Sidebar footer account menu.
 *
 * The Figma reference built this on Radix `DropdownMenu` + `Avatar`. This project
 * has no Radix dependency and hand-rolls its primitives, so the popover is
 * implemented directly — outside-click and Escape dismissal, `aria-expanded` and
 * `role="menu"` wiring, and focus returned to the trigger on close.
 */

type MenuEntry = {
  label: string;
  href: string;
  icon: typeof User;
  implemented: boolean;
};

const MENU_ENTRIES: MenuEntry[] = [
  { label: "Profile", href: "/profile", icon: User, implemented: false },
  { label: "Settings", href: "/settings", icon: Settings, implemented: true },
  { label: "Notifications", href: "/notifications", icon: Bell, implemented: false },
];

export function UserMenu({ email, name, role }: { email: string; name?: string; role?: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const displayName = name ?? email;

  return (
    <div ref={containerRef} className="relative">
      {open ? (
        <div
          role="menu"
          aria-label="My account"
          className="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          <p className="px-3 py-1.5 text-xs font-semibold text-ink-muted">My Account</p>
          <div className="my-1 h-px bg-line" />

          {MENU_ENTRIES.map(({ label, href, icon: Icon, implemented }) =>
            implemented ? (
              <Link
                key={label}
                href={href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-ink hover:bg-canvas"
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            ) : (
              <span
                key={label}
                role="menuitem"
                aria-disabled="true"
                title="Not implemented in this release"
                className="flex cursor-not-allowed items-center gap-2 px-3 py-1.5 text-sm text-ink-subtle"
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </span>
            ),
          )}

          <div className="my-1 h-px bg-line" />

          {/*
           * A form posting to a Server Function, not a link: signing out revokes
           * the session row and clears the cookie, which is a mutation and must
           * not be reachable by a GET that a prefetch or crawler could trigger.
           */}
          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-canvas"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Log out
            </button>
          </form>
        </div>
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((previous) => !previous)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors",
          open ? "bg-canvas" : "hover:bg-canvas",
        )}
      >
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm text-white"
        >
          {deriveInitials(displayName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{displayName}</span>
          {role ? <span className="block truncate text-xs text-ink-muted">{role}</span> : null}
        </span>
      </button>
    </div>
  );
}
