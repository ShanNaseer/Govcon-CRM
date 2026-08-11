"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";

/**
 * Dashboard error boundary. Error boundaries must be Client Components.
 *
 * Next.js strips the message of a server-side error in production, so nothing
 * internal reaches the browser; only the digest is shown, which correlates with
 * the full entry in the server log.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard render failed", { digest: error.digest });
  }, [error]);

  return (
    <Card className="mt-6">
      <ErrorState
        title="This page could not be loaded"
        description={
          error.digest
            ? `An unexpected error occurred. Reference: ${error.digest}`
            : "An unexpected error occurred."
        }
        action={
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </Card>
  );
}
