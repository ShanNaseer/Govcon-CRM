import { z } from "zod";

import { createClientSchema, updateClientSchema } from "@/features/clients/client.schemas";
import { KeywordType } from "@/generated/prisma/enums";
import type { CreateClientInput, UpdateClientInput } from "@/features/clients/client.schemas";

/**
 * Translation between the create-client form and `createClientSchema`.
 *
 * Deliberately separate from the Server Function that calls it, and free of any
 * server-only import: a `"use server"` module exports only callable actions, which
 * cannot be exercised without a Next request context. Keeping the mapping here
 * makes the part with actual logic — blank handling, list splitting, primary NAICS,
 * keyword polarity — directly testable.
 */

/** Every field the form posts, in the order they appear on the page. */
export const CLIENT_FORM_FIELDS = [
  "name",
  "initials",
  "industry",
  "status",
  "cageCode",
  "uei",
  "website",
  "email",
  "phone",
  "city",
  "state",
  "capabilityDescription",
  "securityClearance",
  "minContractValue",
  "maxContractValue",
  "geographicPreferences",
  "naicsCodes",
  "pscCodes",
  "setAsides",
  "preferredAgencies",
  "positiveKeywords",
  "negativeKeywords",
] as const;

/**
 * Reads a text field, mapping blank to undefined.
 *
 * Undefined rather than null: on create, an untouched optional field means "not
 * provided", and the schema's `.nullish()` accepts either — but undefined is what
 * lets a default apply.
 */
function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Reads a mandatory field, keeping the empty string rather than mapping it away.
 *
 * Passing undefined for a blank required field makes Zod report a type mismatch
 * ("expected string, received undefined") instead of the schema's own message. An
 * empty string reaches the `.min(1)` check, so the user sees "Name is required".
 */
function requiredText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Splits a comma- or newline-separated field into unique, non-empty entries.
 *
 * The form collects string collections as free text: a repeatable field group per
 * NAICS code would dominate the form for a value people type as a list. Duplicates
 * are dropped because the database has a unique constraint per client and code, so
 * "541512, 541512" would otherwise fail the write rather than the validation.
 */
function list(formData: FormData, key: string): string[] {
  const raw = formData.get(key);
  if (typeof raw !== "string") return [];

  return [
    ...new Set(
      raw
        .split(/[,\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

/** The submitted values, echoed back so a rejected form keeps the user's typing. */
export function echoClientForm(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    CLIENT_FORM_FIELDS.map((field) => {
      const value = formData.get(field);
      return [field, typeof value === "string" ? value : ""];
    }),
  );
}

export type ParsedClientForm =
  | { success: true; data: CreateClientInput }
  | { success: false; fieldErrors: Record<string, string[]> };

export type ParsedClientEditForm =
  | { success: true; data: UpdateClientInput }
  | { success: false; fieldErrors: Record<string, string[]> };

/**
 * The fields this form actually collects, mapped to schema shape.
 *
 * Shared by create and edit so the two cannot drift. Note what is NOT here:
 * `capabilities`, `certifications` and `contractVehicles` exist on the client model
 * but have no inputs on this form. That absence is load-bearing — see
 * `parseClientEditForm`.
 */
function buildClientFormCandidate(formData: FormData) {
  const naicsCodes = list(formData, "naicsCodes");

  return {
    name: requiredText(formData, "name"),
    initials: text(formData, "initials"),
    industry: text(formData, "industry"),
    status: text(formData, "status"),

    cageCode: text(formData, "cageCode"),
    uei: text(formData, "uei"),

    website: text(formData, "website"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    city: text(formData, "city"),
    state: text(formData, "state"),

    capabilityDescription: text(formData, "capabilityDescription"),
    securityClearance: text(formData, "securityClearance"),
    minContractValue: text(formData, "minContractValue"),
    maxContractValue: text(formData, "maxContractValue"),
    geographicPreferences: list(formData, "geographicPreferences"),

    // The first NAICS code entered is the primary one. The service rejects more
    // than one primary, so this cannot produce an inconsistent profile.
    naicsCodes: naicsCodes.map((code, index) => ({ code, isPrimary: index === 0 })),
    pscCodes: list(formData, "pscCodes").map((code) => ({ code })),
    setAsides: list(formData, "setAsides").map((code) => ({ code })),
    preferredAgencies: list(formData, "preferredAgencies").map((name) => ({ name })),
    keywords: [
      ...list(formData, "positiveKeywords").map((keyword) => ({
        keyword,
        type: KeywordType.POSITIVE,
      })),
      ...list(formData, "negativeKeywords").map((keyword) => ({
        keyword,
        type: KeywordType.NEGATIVE,
      })),
    ],
  };
}

/** Maps the form to a validated `CreateClientInput`, or to per-field messages. */
export function parseClientForm(formData: FormData): ParsedClientForm {
  const parsed = createClientSchema.safeParse(buildClientFormCandidate(formData));
  if (parsed.success) return { success: true, data: parsed.data };

  return { success: false, fieldErrors: collectFieldErrors(parsed.error) };
}

/**
 * Maps the form to a validated `UpdateClientInput`.
 *
 * VALIDATED AGAINST `updateClientSchema`, NOT `createClientSchema`, and this is not a
 * stylistic choice. `createClientSchema` defaults `capabilities`, `certifications` and
 * `contractVehicles` to `[]`, which is right for a new client — but the repository
 * treats an explicit array as "replace this collection wholesale", so reusing the
 * create schema here would send three empty arrays and DELETE every capability,
 * certification and contract vehicle the client had. The form has no inputs for them,
 * so it must say nothing about them; `updateClientSchema` leaves them `undefined`,
 * which the repository reads as "leave unchanged".
 */
export function parseClientEditForm(formData: FormData): ParsedClientEditForm {
  const parsed = updateClientSchema.safeParse(buildClientFormCandidate(formData));
  if (parsed.success) return { success: true, data: parsed.data };

  return { success: false, fieldErrors: collectFieldErrors(parsed.error) };
}

function collectFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  /*
   * One message per distinct path. The money fields carry three refinements that
   * all fail together on non-numeric input ("must be a valid amount", "must be
   * zero or greater", "amount is too large"), which reads as contradictory advice;
   * the first is the accurate one. Distinct paths are kept, so each bad entry in a
   * list still gets its own message.
   */
  const seenPaths = new Set<string>();

  for (const issue of error.issues) {
    const pathKey = issue.path.join(".");
    if (seenPaths.has(pathKey)) continue;
    seenPaths.add(pathKey);

    /*
     * Collection issues arrive as `naicsCodes.0.code`. Attribute them to the single
     * text field the user typed into, prefixed with the offending entry so "NAICS
     * code must be 2-6 digits" points at which one.
     */
    const field = String(issue.path[0] ?? "form");
    const entry = typeof issue.path[1] === "number" ? issue.path[1] : null;
    const message = entry === null ? issue.message : `Entry ${entry + 1}: ${issue.message}`;

    (fieldErrors[field] ??= []).push(message);
  }

  return fieldErrors;
}

/**
 * Turns a stored client into the flat string map the form renders from.
 *
 * The inverse of `buildClientFormCandidate`: collections become the comma-separated
 * text the corresponding textarea shows, and NAICS is emitted primary-first so a
 * save round-trips without silently re-designating which code is primary (the parser
 * treats the first entry as primary).
 */
export function clientToFormValues(client: {
  name: string;
  initials: string | null;
  industry: string | null;
  status: string;
  cageCode: string | null;
  uei: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  capabilityDescription: string | null;
  securityClearance: string | null;
  minContractValue: string | null;
  maxContractValue: string | null;
  geographicPreferences: string[];
  naicsCodes: Array<{ code: string; isPrimary: boolean }>;
  pscCodes: Array<{ code: string }>;
  setAsides: Array<{ code: string }>;
  preferredAgencies: Array<{ name: string }>;
  keywords: Array<{ keyword: string; type: string }>;
}): Record<string, string> {
  const joined = (values: string[]) => values.join(", ");

  return {
    name: client.name,
    initials: client.initials ?? "",
    industry: client.industry ?? "",
    status: client.status,
    cageCode: client.cageCode ?? "",
    uei: client.uei ?? "",
    website: client.website ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    city: client.city ?? "",
    state: client.state ?? "",
    capabilityDescription: client.capabilityDescription ?? "",
    securityClearance: client.securityClearance ?? "",
    minContractValue: client.minContractValue ?? "",
    maxContractValue: client.maxContractValue ?? "",
    geographicPreferences: joined(client.geographicPreferences),
    // Primary first, so re-saving keeps the same primary code.
    naicsCodes: joined(
      [...client.naicsCodes]
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map((entry) => entry.code),
    ),
    pscCodes: joined(client.pscCodes.map((entry) => entry.code)),
    setAsides: joined(client.setAsides.map((entry) => entry.code)),
    preferredAgencies: joined(client.preferredAgencies.map((entry) => entry.name)),
    positiveKeywords: joined(
      client.keywords.filter((entry) => entry.type === "POSITIVE").map((entry) => entry.keyword),
    ),
    negativeKeywords: joined(
      client.keywords.filter((entry) => entry.type === "NEGATIVE").map((entry) => entry.keyword),
    ),
  };
}
