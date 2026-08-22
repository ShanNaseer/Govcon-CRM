"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { createClientAction, type ClientFormState } from "@/app/(dashboard)/clients/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ClientStatus } from "@/generated/prisma/enums";
import { cn, humanizeEnum } from "@/lib/utils";

/**
 * Create-client form.
 *
 * Driven by `useActionState` against a Server Function, so it submits without
 * client JavaScript and the success-path redirect unwinds normally. Validation is
 * the server's — the browser adds only `required` on the one mandatory field, so
 * the rules cannot drift from `createClientSchema`.
 *
 * Collections that are lists of plain strings (NAICS, PSC, set-asides, agencies,
 * keywords) are typed as comma-separated text. The collections that carry extra
 * attributes per entry — capabilities, certifications, contract vehicles — are not
 * here: each needs a repeatable field group, and they belong on the client detail
 * page next to the records they annotate.
 */

const INITIAL_STATE: ClientFormState | null = null;

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null;

  return (
    <p className="mt-1 text-xs text-critical" role="alert">
      {messages.join(" ")}
    </p>
  );
}

function Field({
  label,
  name,
  hint,
  errors,
  required,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  errors?: string[];
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
        {required ? (
          <span className="ml-0.5 text-critical" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-ink-subtle">{hint}</p> : null}
      <FieldError messages={errors} />
    </div>
  );
}

export function ClientForm() {
  const [state, formAction, pending] = useActionState(createClientAction, INITIAL_STATE);

  const errors = state?.fieldErrors ?? {};
  const values = state?.values ?? {};

  /** Marks a field that failed validation, so the error is visible without reading. */
  const invalid = (field: string) => (errors[field] ? "border-critical" : undefined);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-card border border-[#fecaca] bg-critical-soft p-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden />
          <p className="text-sm text-critical">{state.error}</p>
        </div>
      ) : null}

      <Card>
        <CardHeader title="Identity" description="How this company appears throughout the app." />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Company name" name="name" required errors={errors.name}>
              <Input
                id="name"
                name="name"
                required
                maxLength={200}
                defaultValue={values.name}
                placeholder="Northwind Federal Systems"
                className={invalid("name")}
              />
            </Field>
          </div>

          <Field
            label="Initials"
            name="initials"
            hint="Left blank, these are derived from the name."
            errors={errors.initials}
          >
            <Input
              id="initials"
              name="initials"
              maxLength={8}
              defaultValue={values.initials}
              placeholder="NF"
              className={invalid("initials")}
            />
          </Field>

          <Field label="Industry" name="industry" errors={errors.industry}>
            <Input
              id="industry"
              name="industry"
              maxLength={120}
              defaultValue={values.industry}
              placeholder="Information Technology"
              className={invalid("industry")}
            />
          </Field>

          <Field label="Status" name="status" errors={errors.status}>
            <Select id="status" name="status" defaultValue={values.status || ClientStatus.PROSPECT}>
              {Object.values(ClientStatus).map((status) => (
                <option key={status} value={status}>
                  {humanizeEnum(status)}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Government identifiers"
          description="Used to tie this profile to federal registrations."
        />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="CAGE code"
            name="cageCode"
            hint="Exactly 5 alphanumeric characters."
            errors={errors.cageCode}
          >
            <Input
              id="cageCode"
              name="cageCode"
              maxLength={5}
              defaultValue={values.cageCode}
              placeholder="1A2B3"
              className={cn("uppercase", invalid("cageCode"))}
            />
          </Field>

          <Field
            label="UEI"
            name="uei"
            hint="Exactly 12 alphanumeric characters. Must be unique."
            errors={errors.uei}
          >
            <Input
              id="uei"
              name="uei"
              maxLength={12}
              defaultValue={values.uei}
              placeholder="ABC123DEF456"
              className={cn("uppercase", invalid("uei"))}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Contact" />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Website" name="website" errors={errors.website}>
            <Input
              id="website"
              name="website"
              type="url"
              maxLength={300}
              defaultValue={values.website}
              placeholder="https://example.com"
              className={invalid("website")}
            />
          </Field>

          <Field label="Email" name="email" errors={errors.email}>
            <Input
              id="email"
              name="email"
              type="email"
              maxLength={200}
              defaultValue={values.email}
              placeholder="contracts@example.com"
              className={invalid("email")}
            />
          </Field>

          <Field label="Phone" name="phone" errors={errors.phone}>
            <Input
              id="phone"
              name="phone"
              maxLength={40}
              defaultValue={values.phone}
              placeholder="+1 202 555 0100"
              className={invalid("phone")}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="City" name="city" errors={errors.city}>
              <Input
                id="city"
                name="city"
                maxLength={120}
                defaultValue={values.city}
                className={invalid("city")}
              />
            </Field>

            <Field label="State" name="state" errors={errors.state}>
              <Input
                id="state"
                name="state"
                maxLength={60}
                defaultValue={values.state}
                placeholder="VA"
                className={invalid("state")}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Matching profile"
          description="What the matching engine will score opportunities against."
        />
        <CardBody className="space-y-4">
          <Field
            label="Capability description"
            name="capabilityDescription"
            errors={errors.capabilityDescription}
          >
            <Textarea
              id="capabilityDescription"
              name="capabilityDescription"
              maxLength={5000}
              rows={4}
              defaultValue={values.capabilityDescription}
              placeholder="What this company does, in the language a solicitation would use."
              className={invalid("capabilityDescription")}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="NAICS codes"
              name="naicsCodes"
              hint="Comma separated. The first is treated as primary."
              errors={errors.naicsCodes}
            >
              <Input
                id="naicsCodes"
                name="naicsCodes"
                defaultValue={values.naicsCodes}
                placeholder="541512, 541519"
                className={invalid("naicsCodes")}
              />
            </Field>

            <Field
              label="PSC codes"
              name="pscCodes"
              hint="Comma separated."
              errors={errors.pscCodes}
            >
              <Input
                id="pscCodes"
                name="pscCodes"
                defaultValue={values.pscCodes}
                placeholder="D307, R425"
                className={invalid("pscCodes")}
              />
            </Field>

            <Field
              label="Set-aside programs"
              name="setAsides"
              hint="Comma separated codes, e.g. 8A, WOSB, SDVOSB."
              errors={errors.setAsides}
            >
              <Input
                id="setAsides"
                name="setAsides"
                defaultValue={values.setAsides}
                placeholder="8A, SDVOSB"
                className={invalid("setAsides")}
              />
            </Field>

            <Field
              label="Preferred agencies"
              name="preferredAgencies"
              hint="Comma separated."
              errors={errors.preferredAgencies}
            >
              <Input
                id="preferredAgencies"
                name="preferredAgencies"
                defaultValue={values.preferredAgencies}
                placeholder="Department of Veterans Affairs"
                className={invalid("preferredAgencies")}
              />
            </Field>

            <Field
              label="Positive keywords"
              name="positiveKeywords"
              hint="Terms that should attract a match. Comma separated."
              errors={errors.keywords}
            >
              <Input
                id="positiveKeywords"
                name="positiveKeywords"
                defaultValue={values.positiveKeywords}
                placeholder="cloud migration, FedRAMP"
                className={invalid("keywords")}
              />
            </Field>

            <Field
              label="Negative keywords"
              name="negativeKeywords"
              hint="Terms that should push a match away. Comma separated."
            >
              <Input
                id="negativeKeywords"
                name="negativeKeywords"
                defaultValue={values.negativeKeywords}
                placeholder="janitorial, groundskeeping"
              />
            </Field>

            <Field
              label="Geographic preferences"
              name="geographicPreferences"
              hint="Comma separated."
              errors={errors.geographicPreferences}
            >
              <Input
                id="geographicPreferences"
                name="geographicPreferences"
                defaultValue={values.geographicPreferences}
                placeholder="VA, MD, DC"
                className={invalid("geographicPreferences")}
              />
            </Field>

            <Field
              label="Security clearance"
              name="securityClearance"
              errors={errors.securityClearance}
            >
              <Input
                id="securityClearance"
                name="securityClearance"
                maxLength={200}
                defaultValue={values.securityClearance}
                placeholder="Top Secret facility clearance"
                className={invalid("securityClearance")}
              />
            </Field>

            <Field
              label="Minimum contract value"
              name="minContractValue"
              hint="US dollars."
              errors={errors.minContractValue}
            >
              <Input
                id="minContractValue"
                name="minContractValue"
                inputMode="decimal"
                defaultValue={values.minContractValue}
                placeholder="250000"
                className={cn("numeric", invalid("minContractValue"))}
              />
            </Field>

            <Field
              label="Maximum contract value"
              name="maxContractValue"
              hint="US dollars."
              errors={errors.maxContractValue}
            >
              <Input
                id="maxContractValue"
                name="maxContractValue"
                inputMode="decimal"
                defaultValue={values.maxContractValue}
                placeholder="10000000"
                className={cn("numeric", invalid("maxContractValue"))}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link
          href="/clients"
          className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-muted"
        >
          Cancel
        </Link>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Create Client"}
        </Button>
      </div>
    </form>
  );
}
