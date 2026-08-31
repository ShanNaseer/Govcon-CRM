import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { CreateClientInput, ListClientsQuery, UpdateClientInput } from "@/features/clients/client.schemas";
import { prisma } from "@/lib/db/prisma";

/**
 * Data access for the Client aggregate.
 *
 * This is the only module permitted to talk to Prisma for Clients. It returns
 * raw Prisma rows; mapping to transport DTOs happens in the service layer.
 */

/** Relations always loaded for the detail view, kept in one place so shapes stay consistent. */
const clientDetailInclude = {
  naicsCodes: { orderBy: [{ isPrimary: "desc" }, { code: "asc" }] },
  pscCodes: { orderBy: { code: "asc" } },
  capabilities: { orderBy: { name: "asc" } },
  keywords: { orderBy: [{ type: "asc" }, { keyword: "asc" }] },
  certifications: { orderBy: { name: "asc" } },
  setAsides: { orderBy: { code: "asc" } },
  contractVehicles: { orderBy: { name: "asc" } },
  preferredAgencies: { orderBy: { name: "asc" } },
} satisfies Prisma.ClientInclude;

const clientSummarySelect = {
  id: true,
  name: true,
  initials: true,
  industry: true,
  status: true,
  city: true,
  state: true,
  cageCode: true,
  uei: true,
  createdAt: true,
  updatedAt: true,
  naicsCodes: { select: { code: true, isPrimary: true } },
  _count: { select: { naicsCodes: true, capabilities: true, matches: true } },
} satisfies Prisma.ClientSelect;

export type ClientDetailRow = Prisma.ClientGetPayload<{ include: typeof clientDetailInclude }>;
export type ClientSummaryRow = Prisma.ClientGetPayload<{ select: typeof clientSummarySelect }>;

function buildListWhere(query: ListClientsQuery): Prisma.ClientWhereInput {
  const filters: Prisma.ClientWhereInput[] = [];

  if (query.status) {
    filters.push({ status: query.status });
  }

  if (query.naicsCode) {
    filters.push({ naicsCodes: { some: { code: { startsWith: query.naicsCode } } } });
  }

  if (query.search) {
    // Parameterized by Prisma — never string-concatenated into SQL.
    filters.push({
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { industry: { contains: query.search, mode: "insensitive" } },
        { city: { contains: query.search, mode: "insensitive" } },
        { cageCode: { contains: query.search, mode: "insensitive" } },
        { uei: { contains: query.search, mode: "insensitive" } },
      ],
    });
  }

  return filters.length > 0 ? { AND: filters } : {};
}

export async function findManyClients(
  query: ListClientsQuery,
): Promise<{ rows: ClientSummaryRow[]; total: number }> {
  const where = buildListWhere(query);

  const [rows, total] = await Promise.all([
    prisma.client.findMany({
      where,
      select: clientSummarySelect,
      orderBy: { name: "asc" },
      take: query.take,
      skip: query.skip,
    }),
    prisma.client.count({ where }),
  ]);

  return { rows, total };
}

export async function findClientById(id: string): Promise<ClientDetailRow | null> {
  return prisma.client.findUnique({ where: { id }, include: clientDetailInclude });
}

/** Maps validated input to the nested-create payload Prisma expects. */
function toNestedCreateData(input: CreateClientInput) {
  return {
    naicsCodes: { create: input.naicsCodes },
    pscCodes: { create: input.pscCodes },
    capabilities: { create: input.capabilities },
    keywords: { create: input.keywords },
    certifications: { create: input.certifications },
    setAsides: { create: input.setAsides },
    contractVehicles: { create: input.contractVehicles },
    preferredAgencies: { create: input.preferredAgencies },
  };
}

export async function createClient(input: CreateClientInput, initials: string): Promise<ClientDetailRow> {
  return prisma.client.create({
    data: {
      name: input.name,
      initials,
      industry: input.industry,
      status: input.status,
      cageCode: input.cageCode,
      uei: input.uei,
      website: input.website,
      email: input.email,
      phone: input.phone,
      city: input.city,
      state: input.state,
      capabilityDescription: input.capabilityDescription,
      securityClearance: input.securityClearance,
      geographicPreferences: input.geographicPreferences,
      minContractValue: input.minContractValue ?? null,
      maxContractValue: input.maxContractValue ?? null,
      ...toNestedCreateData(input),
    },
    include: clientDetailInclude,
  });
}

/**
 * Applies a partial update.
 *
 * Any related collection present in the payload is replaced wholesale
 * (delete-then-create) inside a single transaction, so a partial write can never
 * leave a client with a half-updated matching profile. Collections absent from
 * the payload are left untouched.
 */
/**
 * Content of one child collection, reduced to a comparable string.
 *
 * Sorted, so two lists holding the same rows in a different order compare equal — the
 * form submits NAICS primary-first while the database returns it code-ordered, and a
 * reorder is not a change worth writing.
 */
function collectionFingerprint(rows: Array<Record<string, unknown>>, keys: string[]): string {
  return rows
    .map((row) =>
      keys
        .map((key) => {
          const value = row[key];
          // Dates and Decimals must compare by value, not by object identity.
          if (value instanceof Date) return value.toISOString();
          return value === null || value === undefined ? "" : String(value);
        })
        .join("\u0001"),
    )
    .sort()
    .join("\u0002");
}

/**
 * Replaces a child collection only when its contents actually differ.
 *
 * WHY THIS EXISTS. The previous version deleted and recreated every collection the
 * input mentioned — sixteen statements for eight collections, inside one interactive
 * transaction. Over a connection pooler each statement costs a network round trip, so
 * a routine edit took over ten seconds and died on Prisma's five-second transaction
 * timeout (P2028). A typical edit changes one scalar and no collections at all, so
 * comparing first turns those sixteen statements into zero.
 */
type CollectionPlan = {
  run: (tx: Prisma.TransactionClient) => Promise<void>;
};

export async function updateClient(
  id: string,
  input: UpdateClientInput,
  initials: string | undefined,
): Promise<ClientDetailRow> {
  const scalarData: Prisma.ClientUpdateInput = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(initials !== undefined ? { initials } : {}),
    ...(input.industry !== undefined ? { industry: input.industry } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.cageCode !== undefined ? { cageCode: input.cageCode } : {}),
    ...(input.uei !== undefined ? { uei: input.uei } : {}),
    ...(input.website !== undefined ? { website: input.website } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.city !== undefined ? { city: input.city } : {}),
    ...(input.state !== undefined ? { state: input.state } : {}),
    ...(input.capabilityDescription !== undefined
      ? { capabilityDescription: input.capabilityDescription }
      : {}),
    ...(input.securityClearance !== undefined ? { securityClearance: input.securityClearance } : {}),
    ...(input.geographicPreferences !== undefined
      ? { geographicPreferences: input.geographicPreferences }
      : {}),
    ...(input.minContractValue !== undefined ? { minContractValue: input.minContractValue } : {}),
    ...(input.maxContractValue !== undefined ? { maxContractValue: input.maxContractValue } : {}),
  };

  /*
   * Read the current children OUTSIDE the transaction, and read ONLY the collections
   * this update actually mentions.
   *
   * Both halves matter on a remote pooled connection. Comparing outside keeps the
   * transaction down to the statements that change something; Prisma issues one query
   * per included relation, so including all eight when the caller mentioned five would
   * be three needless round trips at roughly 300ms each.
   */
  const comparisonInclude = {
    ...(input.naicsCodes !== undefined ? { naicsCodes: true } : {}),
    ...(input.pscCodes !== undefined ? { pscCodes: true } : {}),
    ...(input.capabilities !== undefined ? { capabilities: true } : {}),
    ...(input.keywords !== undefined ? { keywords: true } : {}),
    ...(input.certifications !== undefined ? { certifications: true } : {}),
    ...(input.setAsides !== undefined ? { setAsides: true } : {}),
    ...(input.contractVehicles !== undefined ? { contractVehicles: true } : {}),
    ...(input.preferredAgencies !== undefined ? { preferredAgencies: true } : {}),
  } satisfies Prisma.ClientInclude;

  const current = await prisma.client.findUnique({
    where: { id },
    include: comparisonInclude,
  });

  if (current === null) {
    // The service checks existence first; this is the race, and a plain update would
    // throw a less useful Prisma error.
    throw new Error(`Client ${id} no longer exists`);
  }

  const plans: CollectionPlan[] = [];

  /** Queues a replace for one collection, but only if its contents changed. */
  function planCollection<TInput extends Record<string, unknown>>(
    incoming: TInput[] | undefined,
    existing: Array<Record<string, unknown>>,
    keys: string[],
    replace: (tx: Prisma.TransactionClient, rows: TInput[]) => Promise<void>,
  ): void {
    // Undefined means "leave unchanged" — see the note in parseClientEditForm.
    if (incoming === undefined) return;
    if (collectionFingerprint(incoming, keys) === collectionFingerprint(existing, keys)) return;

    plans.push({ run: (tx) => replace(tx, incoming) });
  }

  planCollection(input.naicsCodes, current.naicsCodes ?? [], ["code", "title", "isPrimary"], async (tx, rows) => {
    await tx.clientNaicsCode.deleteMany({ where: { clientId: id } });
    await tx.clientNaicsCode.createMany({ data: rows.map((item) => ({ ...item, clientId: id })) });
  });

  planCollection(input.pscCodes, current.pscCodes ?? [], ["code", "title"], async (tx, rows) => {
    await tx.clientPscCode.deleteMany({ where: { clientId: id } });
    await tx.clientPscCode.createMany({ data: rows.map((item) => ({ ...item, clientId: id })) });
  });

  planCollection(input.capabilities, current.capabilities ?? [], ["name", "description"], async (tx, rows) => {
    await tx.clientCapability.deleteMany({ where: { clientId: id } });
    await tx.clientCapability.createMany({ data: rows.map((item) => ({ ...item, clientId: id })) });
  });

  planCollection(input.keywords, current.keywords ?? [], ["keyword", "type", "weight"], async (tx, rows) => {
    await tx.clientKeyword.deleteMany({ where: { clientId: id } });
    await tx.clientKeyword.createMany({ data: rows.map((item) => ({ ...item, clientId: id })) });
  });

  planCollection(
    input.certifications,
    current.certifications,
    ["name", "issuedBy", "expiresAt"],
    async (tx, rows) => {
      await tx.clientCertification.deleteMany({ where: { clientId: id } });
      await tx.clientCertification.createMany({ data: rows.map((item) => ({ ...item, clientId: id })) });
    },
  );

  planCollection(input.setAsides, current.setAsides ?? [], ["code", "label"], async (tx, rows) => {
    await tx.clientSetAside.deleteMany({ where: { clientId: id } });
    await tx.clientSetAside.createMany({ data: rows.map((item) => ({ ...item, clientId: id })) });
  });

  planCollection(
    input.contractVehicles,
    current.contractVehicles,
    ["name", "contractNumber", "expiresAt"],
    async (tx, rows) => {
      await tx.clientContractVehicle.deleteMany({ where: { clientId: id } });
      await tx.clientContractVehicle.createMany({
        data: rows.map((item) => ({ ...item, clientId: id })),
      });
    },
  );

  planCollection(input.preferredAgencies, current.preferredAgencies ?? [], ["name"], async (tx, rows) => {
    await tx.clientPreferredAgency.deleteMany({ where: { clientId: id } });
    await tx.clientPreferredAgency.createMany({ data: rows.map((item) => ({ ...item, clientId: id })) });
  });

  /*
   * Nothing to replace: one plain update, no transaction at all. This is the common
   * case — someone corrects a phone number — and it should not pay for a transaction
   * the pooler is reluctant to grant.
   */
  if (plans.length === 0) {
    return prisma.client.update({ where: { id }, data: scalarData, include: clientDetailInclude });
  }

  return prisma.$transaction(
    async (tx) => {
      for (const plan of plans) await plan.run(tx);
      return tx.client.update({ where: { id }, data: scalarData, include: clientDetailInclude });
    },
    /*
     * Generous limits because the connection is pooled and remote: each statement is a
     * round trip of several hundred milliseconds, and the default five seconds is not
     * enough for a client whose whole profile was rewritten. `maxWait` covers the
     * pooler being slow to hand out a session.
     */
    { timeout: 30_000, maxWait: 15_000 },
  );
}

/**
 * What a delete would take with it.
 *
 * Ten tables cascade from `Client`, and two of them are not obviously "part of" the
 * client: `Task` and `OpportunityMatch`. Deleting a client therefore destroys the
 * team's work items and the matching engine's output for it. Counting first lets the
 * confirmation say so, instead of the user discovering it afterwards — there is no
 * undo.
 */
export async function countClientDeletionImpact(id: string): Promise<{
  tasks: number;
  matches: number;
  profileRecords: number;
}> {
  const row = await prisma.client.findUnique({
    where: { id },
    select: {
      _count: {
        select: {
          tasks: true,
          matches: true,
          naicsCodes: true,
          pscCodes: true,
          capabilities: true,
          keywords: true,
          certifications: true,
          setAsides: true,
          contractVehicles: true,
          preferredAgencies: true,
        },
      },
    },
  });

  if (row === null) return { tasks: 0, matches: 0, profileRecords: 0 };

  const counts = row._count;

  return {
    tasks: counts.tasks,
    matches: counts.matches,
    /*
     * The profile's own child rows, summed rather than itemised: losing them is
     * implied by deleting the client, so eight separate figures would bury the two
     * that actually warrant a second thought.
     */
    profileRecords:
      counts.naicsCodes +
      counts.pscCodes +
      counts.capabilities +
      counts.keywords +
      counts.certifications +
      counts.setAsides +
      counts.contractVehicles +
      counts.preferredAgencies,
  };
}

/** Child rows are removed by the schema's `onDelete: Cascade`. */
export async function deleteClient(id: string): Promise<void> {
  await prisma.client.delete({ where: { id } });
}

export async function countClientsByStatus(): Promise<Record<string, number>> {
  const grouped = await prisma.client.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));
}
