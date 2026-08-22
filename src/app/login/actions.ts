"use server";

import { randomBytes } from "node:crypto";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import { checkThrottle, clearFailures, recordFailure } from "@/lib/auth/rate-limit";
import { createSession, destroySession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { describeError, logger } from "@/lib/logger";

/**
 * Sign-in and sign-out Server Functions.
 *
 * Cookie writes must happen here rather than during rendering, so these are the
 * only places a session is created or destroyed.
 */

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export type SignInResult = { error: string };

/**
 * A single message for every rejection — bad email, wrong password, deactivated
 * account. Naming which one failed would let an unauthenticated caller enumerate
 * valid addresses.
 */
const INVALID_CREDENTIALS = "Invalid email or password.";

/**
 * A real hash of a random throwaway secret, verified against when no user matches
 * so that a missing address and a wrong password take the same time to reject.
 * Without it, response time alone reveals which addresses exist.
 *
 * Built on first use and reused, so the cost is paid once per process rather than
 * on every unauthenticated attempt.
 */
let timingDecoyHash: Promise<string> | null = null;

function getTimingDecoyHash(): Promise<string> {
  timingDecoyHash ??= hashPassword(randomBytes(32).toString("base64url"));
  return timingDecoyHash;
}

/**
 * Bound to the form via `useActionState`, hence the leading previous-state
 * argument. Driving the form through the action (rather than an onSubmit handler)
 * keeps sign-in working without client JavaScript and lets `redirect` unwind
 * normally on success.
 */
export async function signIn(
  _previousState: SignInResult | null,
  formData: FormData,
): Promise<SignInResult> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter a valid email address and password." };
  }

  const { email, password } = parsed.data;

  /*
   * Throttle per address. Keying on the address (not the client IP) is what
   * protects a specific account from guessing; note that a distributed attacker
   * spreading attempts across many addresses is not covered — see rate-limit.ts.
   */
  const throttle = checkThrottle(email);
  if (!throttle.allowed) {
    const minutes = Math.ceil(throttle.retryAfterSeconds / 60);
    return {
      error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  let authenticatedUserId: string | null = null;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, isActive: true },
    });

    const passwordMatches = await verifyPassword(
      password,
      user?.passwordHash ?? (await getTimingDecoyHash()),
    );

    if (!user || !user.isActive || !passwordMatches) {
      recordFailure(email);
      // Logged without the password, and with the reason, for operator diagnosis.
      logger.warn("Sign-in rejected", {
        email,
        reason: !user ? "unknown-email" : !user.isActive ? "deactivated" : "bad-password",
      });
      return { error: INVALID_CREDENTIALS };
    }

    // Transparently upgrade a hash created under weaker cost parameters.
    if (needsRehash(user.passwordHash)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(password) },
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await createSession(user.id);
    clearFailures(email);

    const requestHeaders = await headers();
    logger.info("Sign-in succeeded", {
      userId: user.id,
      ip: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });

    authenticatedUserId = user.id;
  } catch (error) {
    logger.error("Sign-in failed", describeError(error));
    return { error: "Could not sign you in right now. Please try again." };
  }

  // `redirect` throws to unwind, so it must sit outside the try block above.
  if (authenticatedUserId) redirect("/");

  return { error: INVALID_CREDENTIALS };
}

export async function signOut(): Promise<void> {
  try {
    await destroySession();
  } catch (error) {
    // A failure here must not trap the user in the app; the cookie delete below
    // has already been attempted, so fall through to the sign-in page regardless.
    logger.error("Sign-out failed", describeError(error));
  }

  redirect("/login");
}
