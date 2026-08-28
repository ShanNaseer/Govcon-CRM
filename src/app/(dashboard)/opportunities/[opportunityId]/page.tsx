import { notFound } from "next/navigation";
import { ExternalLink, Paperclip } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  MatchScoreBadge,
  OpportunityStatusBadge,
  RecommendationBadge,
} from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DefinitionList, DefinitionRow } from "@/components/ui/card";
import { ChipList } from "@/components/ui/chip-list";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { findOpportunityById } from "@/features/opportunities/opportunity.service";
import { requirePagePermission } from "@/lib/auth/session";
import { safeQuery } from "@/lib/db/safe-query";
import { daysUntil, formatCurrencyRange, formatDate, humanizeEnum } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/opportunities/[opportunityId]">) {
  const { opportunityId } = await params;
  const result = await safeQuery("opportunity-metadata", () => findOpportunityById(opportunityId));

  return { title: result.ok && result.data ? result.data.title : "Opportunity" };
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function OpportunityDetailPage({
  params,
}: PageProps<"/opportunities/[opportunityId]">) {
  /*
   * Redirects to the dashboard when the role no longer holds this grant, so a
   * revoked permission reads as "not your page" rather than as an error card. The
   * service checks it again at the data — this is the courtesy, not the boundary.
   */
  await requirePagePermission("opportunities:read");

  const { opportunityId } = await params;
  const now = new Date();

  const result = await safeQuery("opportunity-detail", () => findOpportunityById(opportunityId));

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Opportunity" breadcrumbs={[{ label: "Opportunities", href: "/opportunities" }]} />
        <Card>
          <ErrorState title="Opportunity unavailable" description={result.message} />
        </Card>
      </>
    );
  }

  const opportunity = result.data;
  if (!opportunity) notFound();

  const remainingDays = daysUntil(opportunity.responseDeadline, now);
  const placeOfPerformance =
    [opportunity.placeCity, opportunity.placeState, opportunity.placeCountry].filter(Boolean).join(", ") ||
    null;

  return (
    <>
      <PageHeader
        title={opportunity.title}
        description={opportunity.agency ?? undefined}
        breadcrumbs={[
          { label: "Opportunities", href: "/opportunities" },
          { label: opportunity.solicitationNumber ?? "Detail" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <MatchScoreBadge score={opportunity.bestMatchScore} />
            <OpportunityStatusBadge status={opportunity.status} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Overview" />
            <CardBody>
              {opportunity.description ? (
                <p className="text-sm leading-relaxed whitespace-pre-line text-ink">
                  {opportunity.description}
                </p>
              ) : (
                <p className="text-sm text-ink-subtle">No description was provided by the source.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Solicitation Details" />
            <CardBody>
              <DefinitionList>
                <DefinitionRow label="Solicitation Number">
                  {opportunity.solicitationNumber ? (
                    <span className="numeric">{opportunity.solicitationNumber}</span>
                  ) : null}
                </DefinitionRow>
                <DefinitionRow label="Agency">{opportunity.agency}</DefinitionRow>
                <DefinitionRow label="Sub-Agency">{opportunity.subAgency}</DefinitionRow>
                <DefinitionRow label="Office">{opportunity.office}</DefinitionRow>
                <DefinitionRow label="Source">
                  <span className="inline-flex items-center gap-2">
                    <Badge tone="brand">{humanizeEnum(opportunity.source)}</Badge>
                    {opportunity.sourceUrl ? (
                      <a
                        href={opportunity.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                      >
                        View at source
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : null}
                  </span>
                </DefinitionRow>
                <DefinitionRow label="Set-Aside">{opportunity.setAside}</DefinitionRow>
                <DefinitionRow label="Contract Type">{opportunity.contractType}</DefinitionRow>
                <DefinitionRow label="Estimated Value">
                  {formatCurrencyRange(opportunity.estimatedValueMin, opportunity.estimatedValueMax)}
                </DefinitionRow>
                <DefinitionRow label="Place of Performance">{placeOfPerformance}</DefinitionRow>
                <DefinitionRow label="Posted">{formatDate(opportunity.postedDate)}</DefinitionRow>
                <DefinitionRow label="Response Deadline">
                  <span className="flex flex-wrap items-center gap-2">
                    {formatDate(opportunity.responseDeadline)}
                    {remainingDays !== null ? (
                      <Badge tone={remainingDays < 0 ? "neutral" : remainingDays <= 7 ? "critical" : "neutral"}>
                        {remainingDays < 0 ? "Closed" : `${remainingDays} days left`}
                      </Badge>
                    ) : null}
                  </span>
                </DefinitionRow>
                <DefinitionRow label="Source Status">{opportunity.sourceStatus}</DefinitionRow>
              </DefinitionList>
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader title="NAICS Codes" />
              <CardBody>
                <ChipList
                  numeric
                  tone="brand"
                  items={opportunity.naicsCodes.map((naics) => ({
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
                  items={opportunity.pscCodes.map((psc) => ({
                    id: psc.id,
                    label: psc.code,
                    hint: psc.title,
                  }))}
                  emptyMessage="No PSC codes recorded"
                />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Attachments"
              description="Documents are stored privately in S3 and served through short-lived presigned URLs."
            />
            {opportunity.attachments.length === 0 ? (
              <EmptyState
                icon={<Paperclip className="h-5 w-5" aria-hidden />}
                title="No attachments"
                description="Solicitation documents are captured by the ingestion pipeline, which is not enabled yet."
              />
            ) : (
              <CardBody>
                <ul className="divide-y divide-line">
                  {opportunity.attachments.map((attachment) => (
                    <li key={attachment.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{attachment.fileName}</p>
                        <p className="text-xs text-ink-subtle">
                          {attachment.contentType ?? "Unknown type"} · {formatFileSize(attachment.fileSize)}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-ink-subtle">
                        {formatDate(attachment.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Internal Workflow" />
            <CardBody>
              <DefinitionList>
                <DefinitionRow label="Status">
                  <OpportunityStatusBadge status={opportunity.status} />
                </DefinitionRow>
                <DefinitionRow label="Matched Clients">
                  <span className="numeric">{opportunity.matchCount}</span>
                </DefinitionRow>
                <DefinitionRow label="Imported">{formatDate(opportunity.createdAt)}</DefinitionRow>
                <DefinitionRow label="Last Updated">{formatDate(opportunity.updatedAt)}</DefinitionRow>
              </DefinitionList>
              <p className="mt-3 border-t border-line pt-3 text-xs text-ink-subtle">
                Status changes are available through the API
                (<code className="numeric">PATCH /api/opportunities/{"{id}"}</code>). The in-page control
                arrives with the workflow module.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Why It Matches" description="Populated by the matching engine." />
            {opportunity.matches.length === 0 ? (
              <EmptyState
                title="Not scored yet"
                description="The matching pipeline has not run against this opportunity. Scores and reasons appear here once it does."
              />
            ) : (
              <CardBody className="space-y-4">
                {opportunity.matches.map((match) => (
                  <div key={match.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{match.clientName}</p>
                      <div className="flex items-center gap-1.5">
                        {match.recommendation ? (
                          <RecommendationBadge recommendation={match.recommendation} />
                        ) : null}
                        <MatchScoreBadge score={match.overallScore} />
                      </div>
                    </div>

                    {match.matchReasons.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-sm text-ink-muted">
                        {match.matchReasons.map((reason, index) => (
                          <li key={index}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}

                    {match.risks.length > 0 ? (
                      <div className="mt-2">
                        <p className="text-xs font-medium tracking-wide text-ink-subtle uppercase">Risks</p>
                        <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-sm text-critical">
                          {match.risks.map((risk, index) => (
                            <li key={index}>{risk}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ))}
              </CardBody>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
