import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ClientStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DefinitionList, DefinitionRow } from "@/components/ui/card";
import { ChipList } from "@/components/ui/chip-list";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Tabs, resolveActiveTab, type TabDefinition } from "@/components/ui/tabs";
import { findClientById } from "@/features/clients/client.service";
import { KeywordType } from "@/generated/prisma/enums";
import { DATABASE_UNAVAILABLE_MESSAGE, safeQuery } from "@/lib/db/safe-query";
import { formatCurrencyRange, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Only Overview and Matching Profile have real content in this scaffold. */
const TABS: TabDefinition[] = [
  { key: "overview", label: "Overview", enabled: true },
  { key: "matching", label: "Matching Profile", enabled: true },
  { key: "past-performance", label: "Past Performance", enabled: false },
  { key: "opportunities", label: "Opportunities", enabled: false },
  { key: "contacts", label: "Contacts", enabled: false },
  { key: "deals", label: "Deals", enabled: false },
];

export async function generateMetadata({ params }: PageProps<"/clients/[clientId]">) {
  const { clientId } = await params;
  const result = await safeQuery("client-metadata", () => findClientById(clientId));

  return { title: result.ok && result.data ? result.data.name : "Client" };
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: PageProps<"/clients/[clientId]">) {
  const { clientId } = await params;
  const { tab } = await searchParams;

  const result = await safeQuery("client-detail", () => findClientById(clientId));

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Client" breadcrumbs={[{ label: "Clients", href: "/clients" }]} />
        <Card>
          <ErrorState title="Client unavailable" description={DATABASE_UNAVAILABLE_MESSAGE} />
        </Card>
      </>
    );
  }

  const client = result.data;
  if (!client) notFound();

  const activeTab = resolveActiveTab(TABS, typeof tab === "string" ? tab : undefined);

  const positiveKeywords = client.keywords.filter((keyword) => keyword.type === KeywordType.POSITIVE);
  const negativeKeywords = client.keywords.filter((keyword) => keyword.type === KeywordType.NEGATIVE);

  return (
    <>
      <PageHeader
        title={client.name}
        description={client.industry ?? undefined}
        breadcrumbs={[{ label: "Clients", href: "/clients" }, { label: client.name }]}
        actions={<ClientStatusBadge status={client.status} />}
      />

      <Tabs tabs={TABS} activeKey={activeTab} basePath={`/clients/${client.id}`} />

      {activeTab === "overview" ? (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Contact Information" />
            <CardBody>
              <DefinitionList>
                <DefinitionRow label="Website">
                  {client.website ? (
                    <a
                      href={client.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline"
                    >
                      {client.website}
                    </a>
                  ) : null}
                </DefinitionRow>
                <DefinitionRow label="Email">
                  {client.email ? (
                    <a href={`mailto:${client.email}`} className="text-brand hover:underline">
                      {client.email}
                    </a>
                  ) : null}
                </DefinitionRow>
                <DefinitionRow label="Phone">{client.phone}</DefinitionRow>
                <DefinitionRow label="Location">
                  {[client.city, client.state].filter(Boolean).join(", ") || null}
                </DefinitionRow>
                <DefinitionRow label="Added">{formatDate(client.createdAt)}</DefinitionRow>
              </DefinitionList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="GovCon Profile" />
            <CardBody>
              <DefinitionList>
                <DefinitionRow label="CAGE Code">
                  {client.cageCode ? <span className="numeric">{client.cageCode}</span> : null}
                </DefinitionRow>
                <DefinitionRow label="UEI">
                  {client.uei ? <span className="numeric">{client.uei}</span> : null}
                </DefinitionRow>
                <DefinitionRow label="Primary NAICS">
                  {client.primaryNaicsCode ? (
                    <span className="numeric">{client.primaryNaicsCode}</span>
                  ) : null}
                </DefinitionRow>
                <DefinitionRow label="Security / Clearance">{client.securityClearance}</DefinitionRow>
                <DefinitionRow label="Contract Value Range">
                  {formatCurrencyRange(client.minContractValue, client.maxContractValue)}
                </DefinitionRow>
              </DefinitionList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="NAICS Codes" description="Primary code is listed first." />
            <CardBody>
              <ChipList
                numeric
                tone="brand"
                items={client.naicsCodes.map((naics) => ({
                  id: naics.id,
                  label: naics.code,
                  hint: naics.isPrimary ? "primary" : naics.title,
                }))}
                emptyMessage="No NAICS codes recorded"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="PSC Codes" />
            <CardBody>
              <ChipList
                numeric
                items={client.pscCodes.map((psc) => ({ id: psc.id, label: psc.code, hint: psc.title }))}
                emptyMessage="No PSC codes recorded"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Set-Asides" />
            <CardBody>
              <ChipList
                tone="positive"
                items={client.setAsides.map((setAside) => ({
                  id: setAside.id,
                  label: setAside.code,
                  hint: setAside.label,
                }))}
                emptyMessage="No set-aside qualifications recorded"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Certifications" />
            <CardBody>
              <ChipList
                items={client.certifications.map((certification) => ({
                  id: certification.id,
                  label: certification.name,
                  hint: certification.expiresAt
                    ? `exp. ${formatDate(certification.expiresAt)}`
                    : certification.issuedBy,
                }))}
                emptyMessage="No certifications recorded"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Core Capabilities" />
            <CardBody>
              {client.capabilities.length === 0 ? (
                <p className="text-sm text-ink-subtle">No capabilities recorded</p>
              ) : (
                <ul className="space-y-2">
                  {client.capabilities.map((capability) => (
                    <li key={capability.id}>
                      <p className="text-sm font-medium text-ink">{capability.name}</p>
                      {capability.description ? (
                        <p className="text-sm text-ink-muted">{capability.description}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Contract Vehicles" />
            <CardBody>
              <ChipList
                items={client.contractVehicles.map((vehicle) => ({
                  id: vehicle.id,
                  label: vehicle.name,
                  hint: vehicle.contractNumber,
                }))}
                emptyMessage="No contract vehicles recorded"
              />
            </CardBody>
          </Card>
        </div>
      ) : null}

      {activeTab === "matching" ? (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Capability Description"
              description="Free-text summary used by future semantic matching."
            />
            <CardBody>
              {client.capabilityDescription ? (
                <p className="text-sm whitespace-pre-line text-ink">{client.capabilityDescription}</p>
              ) : (
                <p className="text-sm text-ink-subtle">No capability description recorded</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Positive Keywords" description="Boost an opportunity's rule score." />
            <CardBody>
              <ChipList
                tone="positive"
                items={positiveKeywords.map((keyword) => ({
                  id: keyword.id,
                  label: keyword.keyword,
                  hint: keyword.weight ? `×${keyword.weight}` : null,
                }))}
                emptyMessage="No positive keywords recorded"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Negative Keywords" description="Suppress or disqualify a match." />
            <CardBody>
              <ChipList
                tone="critical"
                items={negativeKeywords.map((keyword) => ({
                  id: keyword.id,
                  label: keyword.keyword,
                  hint: keyword.weight ? `×${keyword.weight}` : null,
                }))}
                emptyMessage="No negative keywords recorded"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Preferred Agencies" />
            <CardBody>
              <ChipList
                tone="brand"
                items={client.preferredAgencies.map((agency) => ({ id: agency.id, label: agency.name }))}
                emptyMessage="No preferred agencies recorded"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Geographic Preferences" />
            <CardBody>
              <ChipList
                items={client.geographicPreferences.map((place, index) => ({
                  id: `${place}-${index}`,
                  label: place,
                }))}
                emptyMessage="No geographic preferences recorded"
              />
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Contract Value Thresholds" description="Hard filters for the matching pipeline." />
            <CardBody>
              <DefinitionList>
                <DefinitionRow label="Minimum">{formatCurrencyRange(client.minContractValue, null)}</DefinitionRow>
                <DefinitionRow label="Maximum">{formatCurrencyRange(null, client.maxContractValue)}</DefinitionRow>
              </DefinitionList>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {activeTab !== "overview" && activeTab !== "matching" ? (
        <Card className="mt-4">
          <EmptyState title="Not implemented yet" description="This section arrives in a later phase." />
        </Card>
      ) : null}
    </>
  );
}
