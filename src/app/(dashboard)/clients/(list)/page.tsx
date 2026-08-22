import Link from "next/link";
import { Building2, Plus } from "lucide-react";

import { ClientFilters } from "@/components/clients/client-filters";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { ClientStatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { listClients } from "@/features/clients/client.service";
import { listClientsQuerySchema } from "@/features/clients/client.schemas";
import { DATABASE_UNAVAILABLE_MESSAGE, safeQuery } from "@/lib/db/safe-query";

export const metadata = { title: "Clients" };

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const params = await searchParams;

  // Filters arrive from the URL, so they are untrusted input and get the same
  // schema treatment as an API request. Invalid values fall back to defaults
  // rather than throwing a page-level error.
  const parsed = listClientsQuerySchema.safeParse(params);
  const query = parsed.success ? parsed.data : listClientsQuerySchema.parse({});

  const result = await safeQuery("clients-list", () => listClients(query));

  const header = (
    <PageHeader
      title="Clients"
      description="Company profiles used to match government opportunities."
      actions={
        <ButtonLink href="/clients/new" variant="primary">
          <Plus aria-hidden />
          Add Client
        </ButtonLink>
      }
    />
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <Card>
          <ErrorState title="Clients unavailable" description={DATABASE_UNAVAILABLE_MESSAGE} />
        </Card>
      </>
    );
  }

  const { items, total } = result.data;
  const isFiltered = Boolean(query.search || query.status || query.naicsCode);

  return (
    <>
      {header}

      <Card>
        <div className="border-b border-line px-4 py-3">
          <ClientFilters search={query.search ?? undefined} status={query.status} />
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-5 w-5" aria-hidden />}
            title={isFiltered ? "No clients match these filters" : "No clients yet"}
            description={
              isFiltered
                ? "Try a broader search term or clear the status filter."
                : "Create a client profile to start matching government opportunities against its capabilities."
            }
            action={
              isFiltered ? (
                <Link href="/clients" className="text-xs font-medium text-brand hover:underline">
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
                    <TH>Client</TH>
                    <TH>Industry</TH>
                    <TH>Status</TH>
                    <TH>GovCon Profile</TH>
                    <TH>Capabilities</TH>
                    <TH>Opportunities</TH>
                    <TH>Projects</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((client) => (
                    <TR key={client.id}>
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-soft text-xs font-semibold text-brand"
                          >
                            {client.initials}
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={`/clients/${client.id}`}
                              className="font-medium text-ink hover:text-brand hover:underline"
                            >
                              {client.name}
                            </Link>
                            {client.city || client.state ? (
                              <p className="text-xs text-ink-subtle">
                                {[client.city, client.state].filter(Boolean).join(", ")}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TD>

                      <TD className="text-ink-muted">{client.industry ?? "—"}</TD>

                      <TD>
                        <ClientStatusBadge status={client.status} />
                      </TD>

                      <TD>
                        <div className="numeric text-xs text-ink-muted">
                          <p>CAGE {client.cageCode ?? "—"}</p>
                          <p>UEI {client.uei ?? "—"}</p>
                          <p>
                            NAICS {client.primaryNaicsCode ?? "—"}
                            {client.naicsCount > 1 ? ` +${client.naicsCount - 1}` : ""}
                          </p>
                        </div>
                      </TD>

                      <TD className="numeric text-ink-muted">{client.capabilityCount}</TD>
                      <TD className="numeric text-ink-muted">{client.matchCount}</TD>
                      {/* Projects is a future module; the column is present so the table shape is settled. */}
                      <TD className="text-ink-subtle">—</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>

            <div className="border-t border-line px-4 py-2 text-xs text-ink-muted">
              Showing {items.length} of {total} client{total === 1 ? "" : "s"}
            </div>
          </>
        )}
      </Card>
    </>
  );
}
