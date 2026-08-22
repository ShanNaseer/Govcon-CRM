/**
 * Creates or updates an application user.
 *
 * There is no self-serve sign-up: accounts are provisioned by an operator, and
 * this is how the first administrator gets in after a fresh migration.
 *
 * Usage:
 *   npm run user:create -- --email you@example.com --name "Your Name" --role ADMIN
 *   npm run user:create -- --email a@b.com --name "A B" --role MEMBER --clients cid1,cid2
 *
 * The password is read from the PASSWORD environment variable, or prompted for
 * without echo. It is never passed as an argument, which would leave it in the
 * shell history and in the process list.
 *
 * Re-running for an existing address updates that user's name, role and scope, and
 * resets the password — revoking their sessions, since a password change must
 * invalidate anything issued under the old one.
 */
import "dotenv/config";

import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

import { PrismaClient } from "../src/generated/prisma/client";
import { UserRole } from "../src/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";

import { resolveDatabaseUrl } from "../src/lib/db/connection-string";
import { hashPassword } from "../src/lib/auth/password";

type Options = {
  email: string;
  name: string;
  role: UserRole;
  clientIds: string[];
  allClients: boolean;
};

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Options {
  const flags = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;

    const key = arg.slice(2);
    const next = argv[index + 1];

    if (next === undefined || next.startsWith("--")) {
      flags.set(key, "true");
    } else {
      flags.set(key, next);
      index += 1;
    }
  }

  const email = flags.get("email")?.trim().toLowerCase();
  const name = flags.get("name")?.trim();
  const rawRole = (flags.get("role") ?? "MEMBER").toUpperCase();

  if (!email) fail("--email is required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(`"${email}" is not a valid email address.`);
  if (!name) fail("--name is required.");

  if (!Object.values(UserRole).includes(rawRole as UserRole)) {
    fail(`--role must be one of: ${Object.values(UserRole).join(", ")}`);
  }
  const role = rawRole as UserRole;

  const clientIds = (flags.get("clients") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  /*
   * ADMIN and MANAGER see every client; MEMBER is restricted to an explicit list.
   * A MEMBER created without --clients therefore sees nothing, which is the
   * intended failure direction.
   */
  const allClients = role === UserRole.ADMIN || role === UserRole.MANAGER;

  if (allClients && clientIds.length > 0) {
    console.warn(`! --clients is ignored for role ${role}, which already has access to all clients.`);
  }

  return { email, name, role, clientIds: allClients ? [] : clientIds, allClients };
}

/** Reads a line from the terminal with echo suppressed. */
async function promptHidden(question: string): Promise<string> {
  if (!stdin.isTTY) {
    fail("No terminal available for a password prompt. Set the PASSWORD environment variable.");
  }

  const rl = createInterface({ input: stdin, output: stdout, terminal: true });

  // `readline` has no built-in masked input; suppress the echo by swallowing writes
  // while the answer is being typed.
  const asMutable = rl as unknown as { _writeToOutput?: (text: string) => void };
  const originalWrite = asMutable._writeToOutput?.bind(rl);
  let muted = false;

  asMutable._writeToOutput = (text: string) => {
    if (muted) return;
    originalWrite?.(text);
  };

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.PASSWORD;
  if (fromEnv) return fromEnv;

  const first = await promptHidden("Password: ");
  const second = await promptHidden("Confirm password: ");

  if (first !== second) fail("Passwords do not match.");
  return first;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");

  const password = await readPassword();

  // Minimum length only. Rejecting on composition rules pushes people toward
  // predictable substitutions; length is what actually resists guessing.
  if (password.length < 12) fail("Password must be at least 12 characters.");

  const adapter = new PrismaPg({
    connectionString: resolveDatabaseUrl(databaseUrl, process.env.DATABASE_CA_CERT_PATH),
  });
  const prisma = new PrismaClient({ adapter });

  try {
    if (options.clientIds.length > 0) {
      const found = await prisma.client.findMany({
        where: { id: { in: options.clientIds } },
        select: { id: true },
      });
      const missing = options.clientIds.filter((id) => !found.some((row) => row.id === id));
      if (missing.length > 0) fail(`No Client exists with id: ${missing.join(", ")}`);
    }

    const passwordHash = await hashPassword(password);
    const existing = await prisma.user.findUnique({ where: { email: options.email } });

    const user = await prisma.user.upsert({
      where: { email: options.email },
      create: {
        email: options.email,
        name: options.name,
        passwordHash,
        role: options.role,
        allClients: options.allClients,
        clientIds: options.clientIds,
        isActive: true,
      },
      update: {
        name: options.name,
        passwordHash,
        role: options.role,
        allClients: options.allClients,
        clientIds: options.clientIds,
        isActive: true,
      },
      select: { id: true, email: true, name: true, role: true, allClients: true },
    });

    let revoked = 0;
    if (existing) {
      // The password just changed, so every session issued under the old one dies.
      ({ count: revoked } = await prisma.session.deleteMany({ where: { userId: user.id } }));
    }

    console.log(`✓ ${existing ? "Updated" : "Created"} ${user.email}`);
    console.log(`  id    ${user.id}`);
    console.log(`  name  ${user.name}`);
    console.log(`  role  ${user.role}`);
    console.log(`  scope ${user.allClients ? "all clients" : `${options.clientIds.length} client(s)`}`);
    if (revoked > 0) console.log(`  revoked ${revoked} existing session(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
