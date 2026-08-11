import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DefinitionList, DefinitionRow } from "@/components/ui/card";
import { isStorageConfigured } from "@/lib/env";

export const metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

/**
 * Configuration status page.
 *
 * Reports only whether each integration is configured — never the values. Region,
 * bucket names and connection strings stay server-side.
 */
export default function SettingsPage() {
  const storageReady = isStorageConfigured();

  return (
    <>
      <PageHeader title="Settings" description="Environment and integration status for this deployment." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Integrations" />
          <CardBody>
            <DefinitionList>
              <DefinitionRow label="Database">
                <Badge tone="brand">PostgreSQL via Prisma</Badge>
              </DefinitionRow>
              <DefinitionRow label="File Storage">
                {storageReady ? (
                  <Badge tone="positive">Configured</Badge>
                ) : (
                  <Badge tone="warning">Not configured</Badge>
                )}
              </DefinitionRow>
              <DefinitionRow label="Authentication">
                <Badge tone="warning">Not configured</Badge>
              </DefinitionRow>
            </DefinitionList>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Opportunity Sources" description="No provider connector is enabled in this release." />
          <CardBody>
            <DefinitionList>
              <DefinitionRow label="SAM.gov">
                <Badge tone="neutral">Planned — Phase 2</Badge>
              </DefinitionRow>
              <DefinitionRow label="BidNet">
                <Badge tone="neutral">Planned</Badge>
              </DefinitionRow>
              <DefinitionRow label="State Portals">
                <Badge tone="neutral">Planned</Badge>
              </DefinitionRow>
            </DefinitionList>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Matching Engine" description="Pipeline stages and their current state." />
          <CardBody>
            <DefinitionList>
              <DefinitionRow label="Hard Filters">
                <Badge tone="neutral">Interface defined</Badge>
              </DefinitionRow>
              <DefinitionRow label="Rule-Based Scoring">
                <Badge tone="neutral">Interface defined</Badge>
              </DefinitionRow>
              <DefinitionRow label="Semantic Similarity">
                <Badge tone="neutral">Not implemented</Badge>
              </DefinitionRow>
              <DefinitionRow label="AI Qualification">
                <Badge tone="neutral">Not implemented</Badge>
              </DefinitionRow>
            </DefinitionList>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
