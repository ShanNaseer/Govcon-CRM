import type { ClientStatus, KeywordType } from "@/generated/prisma/enums";

/**
 * Transport types for the Client domain.
 *
 * These are deliberately not the Prisma model types. Prisma returns `Decimal`
 * and `Date` instances, which do not survive JSON transport or the Server →
 * Client Component boundary intact. Serializing money as a string preserves
 * exact precision; dates become ISO strings.
 */

export type ClientNaicsCodeDto = {
  id: string;
  code: string;
  title: string | null;
  isPrimary: boolean;
};

export type ClientPscCodeDto = {
  id: string;
  code: string;
  title: string | null;
};

export type ClientCapabilityDto = {
  id: string;
  name: string;
  description: string | null;
};

export type ClientKeywordDto = {
  id: string;
  keyword: string;
  type: KeywordType;
  weight: number | null;
};

export type ClientCertificationDto = {
  id: string;
  name: string;
  issuedBy: string | null;
  expiresAt: string | null;
};

export type ClientSetAsideDto = {
  id: string;
  code: string;
  label: string | null;
};

export type ClientContractVehicleDto = {
  id: string;
  name: string;
  contractNumber: string | null;
  expiresAt: string | null;
};

export type ClientPreferredAgencyDto = {
  id: string;
  name: string;
};

/** Row shape for the clients table — counts only, no nested collections. */
export type ClientSummaryDto = {
  id: string;
  name: string;
  initials: string;
  industry: string | null;
  status: ClientStatus;
  city: string | null;
  state: string | null;
  cageCode: string | null;
  uei: string | null;
  primaryNaicsCode: string | null;
  naicsCount: number;
  capabilityCount: number;
  matchCount: number;
  createdAt: string;
  updatedAt: string;
};

/** Full record for the detail page. */
export type ClientDetailDto = ClientSummaryDto & {
  website: string | null;
  email: string | null;
  phone: string | null;
  capabilityDescription: string | null;
  securityClearance: string | null;
  geographicPreferences: string[];
  /** Decimal serialized as a string to avoid float rounding. */
  minContractValue: string | null;
  maxContractValue: string | null;

  naicsCodes: ClientNaicsCodeDto[];
  pscCodes: ClientPscCodeDto[];
  capabilities: ClientCapabilityDto[];
  keywords: ClientKeywordDto[];
  certifications: ClientCertificationDto[];
  setAsides: ClientSetAsideDto[];
  contractVehicles: ClientContractVehicleDto[];
  preferredAgencies: ClientPreferredAgencyDto[];
};

export type ClientListResult = {
  items: ClientSummaryDto[];
  total: number;
  take: number;
  skip: number;
};
