"use client";

import { useActionState } from "react";

import { signIn, type SignInResult } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

/**
 * Credential form for the sign-in page.
 *
 * Driven by `useActionState` rather than an onSubmit handler: the browser posts
 * straight to the Server Function, so the form still works with JavaScript
 * disabled and the success-path redirect unwinds normally instead of having to be
 * distinguished from a real error.
 *
 * Field styling follows the Figma design — stacked labels, 0.5rem-radius inputs,
 * a brand-filled full-width submit, and an inline error panel above it.
 */

/** Design: full-width, 8px radius, 16px/4 padding, base type — not the denser app field. */
const FIELD_CLASSES =
  "w-full rounded-lg border border-line-strong bg-surface px-4 py-2 text-base text-ink " +
  "placeholder:text-ink-subtle disabled:cursor-not-allowed disabled:bg-surface-muted";

const INITIAL_STATE: SignInResult | null = null;

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-muted">
          Email Address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          placeholder="you@company.com"
          className={FIELD_CLASSES}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink-muted">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          placeholder="••••••••"
          className={FIELD_CLASSES}
        />
      </div>

      {state?.error ? (
        <div role="alert" className="rounded-lg border border-[#fecaca] bg-critical-soft p-3">
          <p className="text-sm text-critical">{state.error}</p>
        </div>
      ) : null}

      {/* Design: default-size button (h-9), full width, brand fill. */}
      <Button type="submit" variant="primary" disabled={pending} className="w-full">
        {pending ? "Logging in..." : "Log In"}
      </Button>
    </form>
  );
}
