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

  return prisma.$transaction(async (tx) => {
    if (input.naicsCodes !== undefined) {
      await tx.clientNaicsCode.deleteMany({ where: { clientId: id } });
      await tx.clientNaicsCode.createMany({
        data: input.naicsCodes.map((item) => ({ ...item, clientId: id })),
      });
    }
    if (input.pscCodes !== undefined) {
      await tx.clientPscCode.deleteMany({ where: { clientId: id } });
      await tx.clientPscCode.createMany({ data: input.pscCodes.map((item) => ({ ...item, clientId: id })) });
    }
    if (input.capabilities !== undefined) {
      await tx.clientCapability.deleteMany({ where: { clientId: id } });
      await tx.clientCapability.createMany({
        data: input.capabilities.map((item) => ({ ...item, clientId: id })),
      });
    }
    if (input.keywords !== undefined) {
      await tx.clientKeyword.deleteMany({ where: { clientId: id } });
      await tx.clientKeyword.createMany({ data: input.keywords.map((item) => ({ ...item, clientId: id })) });
    }
    if (input.certifications !== undefined) {
      await tx.clientCertification.deleteMany({ where: { clientId: id } });
      await tx.clientCertification.createMany({
        data: input.certifications.map((item) => ({ ...item, clientId: id })),
      });
    }
    if (input.setAsides !== undefined) {
      await tx.clientSetAside.deleteMany({ where: { clientId: id } });
      await tx.clientSetAside.createMany({ data: input.setAsides.map((item) => ({ ...item, clientId: id })) });
    }
    if (input.contractVehicles !== undefined) {
      await tx.clientContractVehicle.deleteMany({ where: { clientId: id } });
      await tx.clientContractVehicle.createMany({
        data: input.contractVehicles.map((item) => ({ ...item, clientId: id })),
      });
    }
    if (input.preferredAgencies !== undefined) {
      await tx.clientPreferredAgency.deleteMany({ where: { clientId: id } });
      await tx.clientPreferredAgency.createMany({
        data: input.preferredAgencies.map((item) => ({ ...item, clientId: id })),
      });
    }

    return tx.client.update({ where: { id }, data: scalarData, include: clientDetailInclude });
  });
}

/** Child rows are removed by the schema's `onDelete: Cascade`. */
export async function deleteClient(id: string): Promise<void> {
  await prisma.client.delete({ where: { id } });
}

export async function countClientsByStatus(): Promise<Record<string, number>> {
  const grouped = await prisma.client.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));
}
