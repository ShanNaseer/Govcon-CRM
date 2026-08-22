import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { UserRole } from "@/generated/prisma/enums";

/**
 * Authentication boundary.
 *
 * Sessions are server-side records, not signed cookies: the cookie carries an
 * opaque random token and every request resolves it against the `Session` table.
 * That costs one indexed lookup per request and buys immediate revocation —
 * signing out or deactivating a user takes effect at once, which a self-contained
 * JWT cannot offer.
 *
 * Only the SHA-256 of the token is stored. A database disclosure therefore leaks
 * no usable sessions. SHA-256 (not a KDF) is the right choice here because the
 * token is 256 bits of entropy, so there is nothing to brute-force.
 *
 * THREE CALL SITES ARE PROTECTED, all through this module:
 *   1. Feature services  — src/features/**\/*.service.ts call `requireSession()`
 *      before every read and write. This is the real enforcement point: because
 *      it sits at the data source, no page can serve records by forgetting a
 *      check. Next.js layouts are explicitly NOT sufficient for this — they do
 *      not re-render on client-side navigation and do not prevent child segments
 *      from rendering.
 *   2. Route handlers    — src/app/api/**\/route.ts, same function, mapped to 401.
 *   3. Pages and layout  — `requireUser()`, which redirects to /login instead of
 *      throwing, so an expired session lands on the sign-in form rather than an
 *      error boundary.
 */

const COOKIE_NAME = "govcon_session";

/**
 * Absolute session lifetime. Deliberately not sliding: extending the window would
 * mean re-issuing the cookie, and cookies cannot be set while a page renders — so
 * a sliding window would only ever refresh on form submissions, which is
 * surprising behaviour. Users re-authenticate weekly.
 */
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export type Session = {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  /** `"all"` grants unrestricted access; otherwise the explicit Client allow-list. */
  clientIds: string[] | "all";
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issues a session and sets its cookie.
 *
 * Callable only from a Server Function or Route Handler — `cookies().set()` throws
 * during page rendering.
 */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const headerList = await headers();

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: headerList.get("user-agent")?.slice(0, 500) ?? null,
      // Recorded for audit only — never trusted for authorization, as both the
      // header and the socket address can be spoofed or proxied.
      ipAddress: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
  });

  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Resolves the current session, or null.
 *
 * `cache` dedupes the lookup within a single request, so the layout, the page and
 * every service call it makes share one query.
 *
 * Never throws on an absent or invalid session — callers decide whether that is a
 * redirect (`requireUser`) or a 401 (`requireSession`).
 */
export const getSession = cache(async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) return null;

  const record = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      tokenHash: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          allClients: true,
          clientIds: true,
        },
      },
    },
  });

  if (!record) return null;

  /*
   * The lookup above is already an exact-match on the digest, so this comparison
   * is redundant for correctness. It is here to make the equality check constant
   * time regardless of how the query layer is later reimplemented.
   */
  const presented = Buffer.from(hashToken(token));
  const stored = Buffer.from(record.tokenHash);
  if (presented.length !== stored.length || !timingSafeEqual(presented, stored)) return null;

  // Expired sessions are rejected here; `deleteExpiredSessions` reclaims the rows.
  if (record.expiresAt.getTime() <= Date.now()) return null;

  // A deactivated user's existing sessions stop working immediately.
  if (!record.user.isActive) return null;

  return {
    sessionId: record.id,
    userId: record.user.id,
    email: record.user.email,
    name: record.user.name,
    role: record.user.role,
    clientIds: record.user.allClients ? "all" : record.user.clientIds,
  };
});

/**
 * Asserts an authenticated caller, throwing `AppError` with code UNAUTHORIZED —
 * which the API error handler maps to a 401.
 *
 * This is what the feature services call, so it is the check that actually guards
 * the data. Used by route handlers and by any code path where a redirect would be
 * wrong.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();

  if (!session) {
    // Imported lazily to keep this module free of a cycle with the API layer.
    const { AppError } = await import("@/lib/api/errors");
    throw AppError.unauthorized("Authentication required");
  }

  return session;
}

/**
 * Asserts an authenticated caller, redirecting to /login when there is none.
 *
 * For pages and layouts: an expired session should present the sign-in form, not
 * an error page. Never returns when unauthenticated — `redirect` throws.
 */
export async function requireUser(): Promise<Session> {
  const session = await getSession();

  if (!session) redirect("/login");

  return session;
}

/** Revokes the current session and clears its cookie. Server Functions only. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    // deleteMany, not delete: an already-revoked session must not throw on sign-out.
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  cookieStore.delete(COOKIE_NAME);
}

/** Revokes every session for a user — used when deactivating or changing a password. */
export async function destroyAllSessionsForUser(userId: string): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { userId } });
  return count;
}

/** Reclaims expired rows. Safe to call from a scheduled job. */
export async function deleteExpiredSessions(): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  return count;
}

/** Authorization hook for a specific Client record. */
export function canAccessClient(session: Session, clientId: string): boolean {
  return session.clientIds === "all" || session.clientIds.includes(clientId);
}
