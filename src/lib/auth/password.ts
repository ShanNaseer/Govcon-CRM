import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing.
 *
 * Uses scrypt from Node's standard library rather than bcrypt/argon2 — it is a
 * memory-hard KDF suitable for password storage, and it adds no dependency (and
 * no native build step) to a project that otherwise has none.
 *
 * Stored format is self-describing so the cost parameters can be raised later
 * without invalidating existing hashes:
 *
 *   scrypt$<N>$<r>$<p>$<salt-base64>$<derived-key-base64>
 *
 * `verifyPassword` reads the parameters out of the stored string, so an old hash
 * keeps verifying with the cost it was created at. Use `needsRehash` to detect
 * those and transparently upgrade them on next successful sign-in.
 *
 * Deliberately without the `server-only` guard that session.ts carries, so the
 * user-provisioning script can import it — the same reason connection-string.ts
 * omits it. Nothing here reads request state or secrets, and `node:crypto` would
 * fail to resolve in a browser bundle regardless.
 */

/**
 * Promise wrapper around `scrypt`. Written out rather than using `promisify`,
 * whose overload resolution picks the three-argument form and so drops the
 * options object that carries the cost parameters.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/** Current cost parameters. N=2^15 with r=8 needs ~32MB per hash. */
const COST = { N: 32_768, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * scrypt needs 128 * N * r bytes; Node's default `maxmem` is 32MB, which the
 * parameters above sit exactly on. Ask for headroom so a cost increase does not
 * fail at runtime.
 */
const MAX_MEMORY = 128 * COST.N * COST.r * 2;

async function derive(
  password: string,
  salt: Buffer,
  cost: { N: number; r: number; p: number },
): Promise<Buffer> {
  return scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N: cost.N,
    r: cost.r,
    p: cost.p,
    maxmem: Math.max(MAX_MEMORY, 128 * cost.N * cost.r * 2),
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await derive(password, salt, COST);

  return [
    "scrypt",
    COST.N,
    COST.r,
    COST.p,
    salt.toString("base64"),
    derivedKey.toString("base64"),
  ].join("$");
}

/**
 * Verifies a candidate password against a stored hash.
 *
 * Returns false rather than throwing on a malformed hash: a corrupt row must fail
 * the sign-in, not surface a 500 that distinguishes it from a wrong password.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, rawN, rawR, rawP, rawSalt, rawKey] = parts;
  const cost = { N: Number(rawN), r: Number(rawR), p: Number(rawP) };

  if (!Number.isInteger(cost.N) || !Number.isInteger(cost.r) || !Number.isInteger(cost.p)) {
    return false;
  }

  const salt = Buffer.from(rawSalt, "base64");
  const expected = Buffer.from(rawKey, "base64");
  if (salt.length === 0 || expected.length === 0) return false;

  let candidate: Buffer;
  try {
    candidate = await derive(password, salt, cost);
  } catch {
    return false;
  }

  // Length is checked first because timingSafeEqual throws on a mismatch.
  if (candidate.length !== expected.length) return false;

  return timingSafeEqual(candidate, expected);
}

/** True when a stored hash was produced with weaker parameters than current policy. */
export function needsRehash(storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;

  return Number(parts[1]) < COST.N || Number(parts[2]) < COST.r;
}
