import { z } from "zod";

import { ClientStatus, KeywordType } from "@/generated/prisma/enums";

/**
 * Zod schemas for the Client domain. These are the only accepted shape for
 * external input — every route handler validates against them before the service
 * layer runs. Shared with the client bundle, so nothing server-only may be imported.
 */

/**
 * Optional free text. The empty string becomes `null` (an explicit "clear this
 * field") while an omitted key stays `undefined` ("leave unchanged"). The update
 * repository relies on that distinction.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullish();

/** Money accepted as a number or numeric string; normalized to a fixed-precision string for Decimal. */
const moneySchema = z
  .union([z.number(), z.string()])
  .refine((value) => value !== "" && Number.isFinite(Number(value)), { error: "Must be a valid amount" })
  .refine((value) => Number(value) >= 0, { error: "Must be zero or greater" })
  .refine((value) => Number(value) <= 999_999_999_999, { error: "Amount is too large" })
  .transform((value) => Number(value).toFixed(2))
  .nullish();

export const naicsCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{2,6}$/, { error: "NAICS code must be 2–6 digits" }),
  title: optionalText(200),
  isPrimary: z.boolean().default(false),
});

export const pscCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{2,6}$/, { error: "PSC code must be 2–6 alphanumeric characters" })
    .transform((value) => value.toUpperCase()),
  title: optionalText(200),
});

export const capabilitySchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: optionalText(1000),
});

export const keywordSchema = z.object({
  keyword: z.string().trim().min(1).max(100),
  type: z.enum(KeywordType),
  weight: z.number().int().min(1).max(100).nullish(),
});

export const certificationSchema = z.object({
  name: z.string().trim().min(1).max(150),
  issuedBy: optionalText(150),
  expiresAt: z.coerce.date().nullish(),
});

export const setAsideSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((value) => value.toUpperCase()),
  label: optionalText(150),
});

export const contractVehicleSchema = z.object({
  name: z.string().trim().min(1).max(150),
  contractNumber: optionalText(100),
  expiresAt: z.coerce.date().nullish(),
});

export const preferredAgencySchema = z.object({
  name: z.string().trim().min(1).max(200),
});

/**
 * Field definitions without any `.default()`.
 *
 * This split matters: `z.object(...).partial()` does NOT strip defaults in Zod 4,
 * so deriving the update schema from a defaulted create schema would silently
 * materialize `status: PROSPECT` and empty arrays for keys the caller never sent
 * — resetting the status and deleting every related row on an unrelated PATCH.
 * Defaults are therefore applied only where they belong, on create.
 */
const clientFields = {
  name: z.string().trim().min(1, { error: "Name is required" }).max(200),
  initials: optionalText(8),
  industry: optionalText(120),
  status: z.enum(ClientStatus),

  cageCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{5}$/, { error: "CAGE code must be 5 alphanumeric characters" })
    .transform((value) => value.toUpperCase())
    .nullish(),
  uei: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{12}$/, { error: "UEI must be 12 alphanumeric characters" })
    .transform((value) => value.toUpperCase())
    .nullish(),

  website: z.url({ error: "Must be a valid URL" }).max(300).nullish(),
  email: z.email({ error: "Must be a valid email address" }).max(200).nullish(),
  phone: optionalText(40),
  city: optionalText(120),
  state: optionalText(60),

  capabilityDescription: optionalText(5000),
  securityClearance: optionalText(200),
  geographicPreferences: z.array(z.string().trim().min(1).max(100)).max(50),
  minContractValue: moneySchema,
  maxContractValue: moneySchema,

  naicsCodes: z.array(naicsCodeSchema).max(50),
  pscCodes: z.array(pscCodeSchema).max(50),
  capabilities: z.array(capabilitySchema).max(50),
  keywords: z.array(keywordSchema).max(200),
  certifications: z.array(certificationSchema).max(50),
  setAsides: z.array(setAsideSchema).max(30),
  contractVehicles: z.array(contractVehicleSchema).max(50),
  preferredAgencies: z.array(preferredAgencySchema).max(50),
} as const;

/** Full create payload. Collections default to empty; status defaults to PROSPECT. */
export const createClientSchema = z.object({
  ...clientFields,
  status: clientFields.status.default(ClientStatus.PROSPECT),
  geographicPreferences: clientFields.geographicPreferences.default([]),
  naicsCodes: clientFields.naicsCodes.default([]),
  pscCodes: clientFields.pscCodes.default([]),
  capabilities: clientFields.capabilities.default([]),
  keywords: clientFields.keywords.default([]),
  certifications: clientFields.certifications.default([]),
  setAsides: clientFields.setAsides.default([]),
  contractVehicles: clientFields.contractVehicles.default([]),
  preferredAgencies: clientFields.preferredAgencies.default([]),
});

/**
 * Partial update. An omitted key means "leave unchanged"; an explicit `null`
 * clears a scalar, and an explicit array replaces that collection wholesale.
 */
export const updateClientSchema = z
  .object({
    ...clientFields,
    name: clientFields.name.optional(),
    status: clientFields.status.optional(),
    geographicPreferences: clientFields.geographicPreferences.optional(),
    naicsCodes: clientFields.naicsCodes.optional(),
    pscCodes: clientFields.pscCodes.optional(),
    capabilities: clientFields.capabilities.optional(),
    keywords: clientFields.keywords.optional(),
    certifications: clientFields.certifications.optional(),
    setAsides: clientFields.setAsides.optional(),
    contractVehicles: clientFields.contractVehicles.optional(),
    preferredAgencies: clientFields.preferredAgencies.optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    error: "At least one field must be provided",
  });

/** Query parameters for the list endpoint. */
export const listClientsQuerySchema = z.object({
  search: optionalText(200),
  status: z.enum(ClientStatus).optional(),
  naicsCode: optionalText(6),
  take: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export const clientIdSchema = z.string().trim().min(1).max(64);

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
