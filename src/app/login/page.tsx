import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Target } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { Card } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";

/**
 * Sign-in page, transcribed from the Figma design: centred card on the grey
 * canvas, gradient logo tile, and stacked credential fields.
 *
 * Outside the (dashboard) route group, so it renders without the app chrome.
 */

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "GovCon CRM";

export const metadata: Metadata = {
  title: "Log in",
};

/** Reads the session cookie, so this page must never be prerendered. */
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // An already-authenticated visitor has no use for this page.
  if (await getSession()) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-20">
      <Card className="w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <span
            aria-hidden
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-brand to-brand-light text-white"
          >
            <Target className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-semibold text-ink">Log in to {appName}</h1>
        </div>

        <LoginForm />

        <p className="mt-6 text-center text-sm text-ink-muted">
          {/*
           * The design links to a self-serve sign-up. This is an internal tool with
           * no such route — accounts are provisioned by an operator — so the
           * affordance says how access is granted instead of pointing at a page
           * that does not exist.
           */}
          Need an account? Ask your administrator for an invitation.
        </p>
      </Card>
    </div>
  );
}
