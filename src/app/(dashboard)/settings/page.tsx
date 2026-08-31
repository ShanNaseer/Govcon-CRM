import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DefinitionList, DefinitionRow } from "@/components/ui/card";
import { getSyncStatus } from "@/features/opportunities/opportunity.sync.service";
import { requirePagePermission } from "@/lib/auth/session";
import { safeQuery } from "@/lib/db/safe-query";
import { formatDate } from "@/lib/utils";
import { isHigherGovConfigured, isStorageConfigured } from "@/lib/env";

export const metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

/**
 * Configuration status page.
 *
 * Reports only whether each integration is configured — never the values. Region,
 * bucket names and connection strings stay server-side.
 */
export default async function SettingsPage() {
  /*
   * This page reads no records, so there is no service beneath it to hold the check
   * — the gate here IS the boundary for `settings:read`, not a courtesy on top of
   * one. It also stops the deployment's integration status being readable by a role
   * whose Settings entry has been switched off in the matrix.
   */
  await requirePagePermission("settings:read");

  const storageReady = isStorageConfigured();
  const feedReady = isHigherGovConfigured();

  // Behind safeQuery: a settings page reporting configuration must not itself fail
  // because the database is unreachable — that is one of the things it is reporting.
  const syncStatus = feedReady ? await safeQuery("sync-status", () => getSyncStatus()) : null;

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
          <CardHeader
            title="Opportunity Sources"
            description="HigherGov aggregates several government systems through one feed."
          />
          <CardBody>
            <DefinitionList>
              <DefinitionRow label="HigherGov feed">
                {feedReady ? (
                  <Badge tone="positive">Connected</Badge>
                ) : (
                  <Badge tone="warning">HIGHERGOV_API_KEY not set</Badge>
                )}
              </DefinitionRow>
              <DefinitionRow label="Last sync">
                {syncStatus?.ok && syncStatus.data.lastRunAt ? (
                  <span className="text-sm text-ink-muted">
                    {formatDate(syncStatus.data.lastRunAt)}
                    {syncStatus.data.lastCapturedDate
                      ? ` · caught up to ${syncStatus.data.lastCapturedDate}`
                      : " · no complete day imported yet"}
                  </span>
                ) : (
                  <span className="text-sm text-ink-subtle">Never run</span>
                )}
              </DefinitionRow>
              <DefinitionRow label="Covers">
                {/*
                 * Named rather than badged as "planned": these arrive through the one
                 * connector above, so their availability is not separately switchable.
                 */}
                <span className="text-sm text-ink-muted">
                  SAM.gov, DIBBS, SBIR, Grants, State &amp; Local
                </span>
              </DefinitionRow>
              <DefinitionRow label="BidNet">
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
