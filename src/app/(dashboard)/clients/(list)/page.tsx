import Link from "next/link";
import { Building2, Pencil, Plus } from "lucide-react";

import { ClientFilters } from "@/components/clients/client-filters";
import { DeleteClientButton } from "@/components/clients/delete-client-button";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { ClientStatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { listClients } from "@/features/clients/client.service";
import { listClientsQuerySchema } from "@/features/clients/client.schemas";
import { requirePagePermission, sessionHasPermission } from "@/lib/auth/session";
import { safeQuery } from "@/lib/db/safe-query";

export const metadata = { title: "Clients" };

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  /*
   * Redirects to the dashboard when the role no longer holds this grant, so a
   * revoked permission reads as "not your page" rather than as an error card. The
   * service checks it again at the data — this is the courtesy, not the boundary.
   */
  const session = await requirePagePermission("clients:read");
  const canWrite = sessionHasPermission(session, "clients:write");

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
        // Hidden without `clients:write`, because /clients/new now redirects
        // without it — a button whose only outcome is a redirect is worse than no
        // button.
        canWrite ? (
          <ButtonLink href="/clients/new" variant="primary">
            <Plus aria-hidden />
            Add Client
          </ButtonLink>
        ) : null
      }
    />
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <Card>
          <ErrorState title="Clients unavailable" description={result.message} />
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
                    {/* Header text is for screen readers: the column holds row actions. */}
                    {canWrite ? (
                      <TH>
                        <span className="sr-only">Actions</span>
                      </TH>
                    ) : null}
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

                      {canWrite ? (
                        <TD>
                          <div className="flex items-center gap-3">
                            <Link
                              href={`/clients/${client.id}/edit`}
                              // Named per row: screen readers announce links out of
                              // context, so a column of bare "Edit" links is useless.
                              aria-label={`Edit ${client.name}`}
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                              Edit
                            </Link>
                            <DeleteClientButton
                              clientId={client.id}
                              clientName={client.name}
                              variant="link"
                            />
                          </div>
                        </TD>
                      ) : null}
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
