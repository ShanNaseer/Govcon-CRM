import "server-only";

import type {
  ClientDetailRow,
  ClientSummaryRow,
} from "@/features/clients/client.repository";
import * as repository from "@/features/clients/client.repository";
import type { CreateClientInput, ListClientsQuery, UpdateClientInput } from "@/features/clients/client.schemas";
import type { ClientDetailDto, ClientListResult, ClientSummaryDto } from "@/features/clients/client.types";
import { AppError } from "@/lib/api/errors";
import { requirePermission } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { deriveInitials } from "@/lib/utils";

/**
 * Business logic for the Client domain.
 *
 * Route handlers and Server Components both call into here; neither touches the
 * repository or Prisma directly. This layer owns validation that needs more than
 * a schema (cross-field rules), DTO mapping, and domain error semantics.
 *
 * It is also the authorization choke point. Every exported function calls
 * `requirePermission()` first — `clients:read` to look, `clients:write` to change —
 * because a Server Component's data is serialized into the RSC payload even when
 * its parent layout declines to render it, so a check in the layout alone does NOT
 * keep records out of the response. The check must live next to the data access,
 * which is here.
 *
 * The permission, not merely a session: those grants are editable per role from
 * /team/permissions, and a control that only hid the sidebar entry would be a
 * setting that does not set anything.
 */

/** Prisma `Decimal` -> exact decimal string, preserving cents. */
function decimalToString(value: { toFixed(digits: number): string } | null): string | null {
  return value === null ? null : value.toFixed(2);
}

function dateToIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function toSummaryDto(row: ClientSummaryRow): ClientSummaryDto {
  const primary = row.naicsCodes.find((naics) => naics.isPrimary) ?? row.naicsCodes[0];

  return {
    id: row.id,
    name: row.name,
    initials: row.initials ?? deriveInitials(row.name),
    industry: row.industry,
    status: row.status,
    city: row.city,
    state: row.state,
    cageCode: row.cageCode,
    uei: row.uei,
    primaryNaicsCode: primary?.code ?? null,
    naicsCount: row._count.naicsCodes,
    capabilityCount: row._count.capabilities,
    matchCount: row._count.matches,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetailDto(row: ClientDetailRow): ClientDetailDto {
  const primary = row.naicsCodes.find((naics) => naics.isPrimary) ?? row.naicsCodes[0];

  return {
    id: row.id,
    name: row.name,
    initials: row.initials ?? deriveInitials(row.name),
    industry: row.industry,
    status: row.status,
    city: row.city,
    state: row.state,
    cageCode: row.cageCode,
    uei: row.uei,
    primaryNaicsCode: primary?.code ?? null,
    naicsCount: row.naicsCodes.length,
    capabilityCount: row.capabilities.length,
    matchCount: 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),

    website: row.website,
    email: row.email,
    phone: row.phone,
    capabilityDescription: row.capabilityDescription,
    securityClearance: row.securityClearance,
    geographicPreferences: row.geographicPreferences,
    minContractValue: decimalToString(row.minContractValue),
    maxContractValue: decimalToString(row.maxContractValue),

    naicsCodes: row.naicsCodes.map((item) => ({
      id: item.id,
      code: item.code,
      title: item.title,
      isPrimary: item.isPrimary,
    })),
    pscCodes: row.pscCodes.map((item) => ({ id: item.id, code: item.code, title: item.title })),
    capabilities: row.capabilities.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
    })),
    keywords: row.keywords.map((item) => ({
      id: item.id,
      keyword: item.keyword,
      type: item.type,
      weight: item.weight,
    })),
    certifications: row.certifications.map((item) => ({
      id: item.id,
      name: item.name,
      issuedBy: item.issuedBy,
      expiresAt: dateToIso(item.expiresAt),
    })),
    setAsides: row.setAsides.map((item) => ({ id: item.id, code: item.code, label: item.label })),
    contractVehicles: row.contractVehicles.map((item) => ({
      id: item.id,
      name: item.name,
      contractNumber: item.contractNumber,
      expiresAt: dateToIso(item.expiresAt),
    })),
    preferredAgencies: row.preferredAgencies.map((item) => ({ id: item.id, name: item.name })),
  };
}

/** Cross-field rules that a per-field schema cannot express. */
function assertConsistentInput(input: CreateClientInput | UpdateClientInput): void {
  const { minContractValue, maxContractValue } = input;

  if (
    minContractValue !== undefined &&
    minContractValue !== null &&
    maxContractValue !== undefined &&
    maxContractValue !== null &&
    Number(minContractValue) > Number(maxContractValue)
  ) {
    throw AppError.validation("Minimum contract value cannot exceed the maximum contract value", {
      minContractValue: ["Must be less than or equal to the maximum contract value"],
    });
  }

  if (input.naicsCodes && input.naicsCodes.filter((naics) => naics.isPrimary).length > 1) {
    throw AppError.validation("Only one NAICS code can be marked as primary", {
      naicsCodes: ["Only one entry may have isPrimary set"],
    });
  }
}

export async function listClients(query: ListClientsQuery): Promise<ClientListResult> {
  await requirePermission("clients:read");

  const { rows, total } = await repository.findManyClients(query);

  return {
    items: rows.map(toSummaryDto),
    total,
    take: query.take,
    skip: query.skip,
  };
}

export async function getClientById(id: string): Promise<ClientDetailDto> {
  await requirePermission("clients:read");

  const row = await repository.findClientById(id);
  if (!row) throw AppError.notFound("Client", id);
  return toDetailDto(row);
}

/** Returns null instead of throwing — for pages that render their own not-found UI. */
export async function findClientById(id: string): Promise<ClientDetailDto | null> {
  await requirePermission("clients:read");

  const row = await repository.findClientById(id);
  return row ? toDetailDto(row) : null;
}

export async function createClient(input: CreateClientInput): Promise<ClientDetailDto> {
  await requirePermission("clients:write");
  assertConsistentInput(input);

  const initials = input.initials ?? deriveInitials(input.name);
  const row = await repository.createClient(input, initials);

  logger.info("Client created", { clientId: row.id });
  return toDetailDto(row);
}

export async function updateClient(id: string, input: UpdateClientInput): Promise<ClientDetailDto> {
  await requirePermission("clients:write");
  assertConsistentInput(input);

  const existing = await repository.findClientById(id);
  if (!existing) throw AppError.notFound("Client", id);

  // Regenerate initials only when the name changed and none were supplied explicitly.
  const initials =
    input.initials ?? (input.name !== undefined ? deriveInitials(input.name) : undefined);

  const row = await repository.updateClient(id, input, initials);

  logger.info("Client updated", { clientId: id });
  return toDetailDto(row);
}

export async function deleteClient(id: string): Promise<void> {
  await requirePermission("clients:write");

  const existing = await repository.findClientById(id);
  if (!existing) throw AppError.notFound("Client", id);

  await repository.deleteClient(id);
  logger.info("Client deleted", { clientId: id });
}

export async function getClientStatusCounts(): Promise<Record<string, number>> {
  await requirePermission("clients:read");

  return repository.countClientsByStatus();
}
