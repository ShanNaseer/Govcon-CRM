import "server-only";

/**
 * Fixed-window throttle for sign-in attempts.
 *
 * SCOPE: in-process memory. That is sufficient for a single-instance deployment
 * and for local development, and it is a real mitigation against online password
 * guessing against one account. It is NOT sufficient behind more than one
 * instance, where each process keeps its own tally — move this to Redis (or the
 * database, or a WAF rule) before scaling horizontally.
 */

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

/** Entries are pruned lazily on access, so an idle key costs nothing to keep. */
const attempts = new Map<string, { count: number; expiresAt: number }>();

export type ThrottleState = { allowed: boolean; retryAfterSeconds: number };

export function checkThrottle(key: string): ThrottleState {
  const entry = attempts.get(key);
  const now = Date.now();

  if (!entry || entry.expiresAt <= now) {
    attempts.delete(key);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.count < MAX_ATTEMPTS) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.expiresAt - now) / 1000)),
  };
}

/** Records a failure. The window starts at the first failure and does not extend. */
export function recordFailure(key: string): void {
  const entry = attempts.get(key);
  const now = Date.now();

  if (!entry || entry.expiresAt <= now) {
    attempts.set(key, { count: 1, expiresAt: now + WINDOW_MS });
    return;
  }

  entry.count += 1;
}

/** Clears the tally for a key. Called after a successful sign-in. */
export function clearFailures(key: string): void {
  attempts.delete(key);
}
