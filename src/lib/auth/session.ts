import "server-only";

/**
 * Authentication boundary — NOT YET IMPLEMENTED.
 *
 * This module is the single seam where an auth provider gets wired in. No custom
 * password handling is implemented here on purpose; the provider (e.g. an OIDC
 * IdP, AWS Cognito, or Auth.js) will be selected separately.
 *
 * Three call sites must be protected before this application is exposed:
 *   1. Dashboard routes  — src/app/(dashboard)/layout.tsx
 *   2. API route handlers — src/app/api/**\/route.ts
 *   3. S3 presigned URL endpoints — src/app/api/storage/**\/route.ts (highest risk:
 *      they mint credentials that grant direct object access)
 *
 * Until a provider is wired in, `requireSession` returns a placeholder identity
 * so the scaffold runs locally. It throws in production so an unauthenticated
 * build can never be deployed by accident.
 */

export type Session = {
  userId: string;
  email: string;
  /** Reserved for per-client authorization once tenancy rules are defined. */
  clientIds: string[] | "all";
};

const DEVELOPMENT_SESSION: Session = {
  userId: "dev-user",
  email: "dev@localhost",
  clientIds: "all",
};

/**
 * Resolves the current session.
 *
 * TODO(auth): replace with a real provider lookup and remove the development fallback.
 */
export async function getSession(): Promise<Session | null> {
  if (process.env.NODE_ENV === "production") return null;
  return DEVELOPMENT_SESSION;
}

/**
 * Asserts an authenticated caller. Route handlers call this first; it throws an
 * `AppError` with code UNAUTHORIZED, which the error handler maps to a 401.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();

  if (!session) {
    // Imported lazily to keep this module free of a cycle with the API layer.
    const { AppError } = await import("@/lib/api/errors");
    throw AppError.unauthorized("Authentication is not configured for this deployment");
  }

  return session;
}

/**
 * Authorization hook for a specific Client record.
 *
 * TODO(auth): enforce real per-user scoping once roles/tenancy are defined.
 */
export function canAccessClient(session: Session, clientId: string): boolean {
  return session.clientIds === "all" || session.clientIds.includes(clientId);
}
