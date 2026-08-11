import Link from "next/link";
import { Radar } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { OpportunityFilters } from "@/components/opportunities/opportunity-filters";
import { OpportunityRow } from "@/components/opportunities/opportunity-row";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableWrapper, TBody, TH, THead, TR } from "@/components/ui/table";
import { listOpportunitiesQuerySchema } from "@/features/opportunities/opportunity.schemas";
import { listOpportunities } from "@/features/opportunities/opportunity.service";
import { DATABASE_UNAVAILABLE_MESSAGE, safeQuery } from "@/lib/db/safe-query";

export const metadata = { title: "Opportunities" };

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage({ searchParams }: PageProps<"/opportunities">) {
  const params = await searchParams;
  const now = new Date();

  // URL parameters are untrusted; invalid values fall back to defaults rather
  // than failing the page. Empty strings from the filter form parse to undefined.
  const parsed = listOpportunitiesQuerySchema.safeParse(
    Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== "" && value !== undefined),
    ),
  );
  const query = parsed.success ? parsed.data : listOpportunitiesQuerySchema.parse({});

  const result = await safeQuery("opportunities-list", () => listOpportunities(query, now));

  const header = (
    <PageHeader
      title="Opportunities"
      description="Normalized government solicitations from every connected source."
    />
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <Card>
          <ErrorState title="Opportunities unavailable" description={DATABASE_UNAVAILABLE_MESSAGE} />
        </Card>
      </>
    );
  }

  const { items, total } = result.data;
  const isFiltered = Object.keys(params).some((key) => key !== "take" && key !== "skip");

  return (
    <>
      {header}

      <Card>
        <div className="border-b border-line px-4 py-3">
          <OpportunityFilters query={query} />
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={<Radar className="h-5 w-5" aria-hidden />}
            title={isFiltered ? "No opportunities match these filters" : "No opportunities yet"}
            description={
              isFiltered
                ? "Try widening the deadline window or clearing the score filter."
                : "Opportunities appear here once a provider connector imports and normalizes them. No source integration is enabled in this release."
            }
            action={
              isFiltered ? (
                <Link href="/opportunities" className="text-xs font-medium text-brand hover:underline">
                  Clear filters
                </Link>
              ) : null
            }
          />
        ) : (
          <>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Score</TH>
                    <TH>Title</TH>
                    <TH>Agency</TH>
                    <TH>Source</TH>
                    <TH>NAICS</TH>
                    <TH>Set-Aside</TH>
                    <TH>Posted</TH>
                    <TH>Deadline</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((opportunity) => (
                    <OpportunityRow key={opportunity.id} opportunity={opportunity} now={now} />
                  ))}
                </TBody>
              </Table>
            </TableWrapper>

            <div className="border-t border-line px-4 py-2 text-xs text-ink-muted">
              Showing {items.length} of {total} opportunit{total === 1 ? "y" : "ies"}
            </div>
          </>
        )}
      </Card>
    </>
  );
}
