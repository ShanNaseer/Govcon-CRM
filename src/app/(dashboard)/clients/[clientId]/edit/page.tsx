import { notFound } from "next/navigation";

import { updateClientAction } from "@/app/(dashboard)/clients/actions";
import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";
import { clientToFormValues } from "@/features/clients/client.form";
import { findClientById } from "@/features/clients/client.service";
import { requirePagePermission } from "@/lib/auth/session";
import { safeQuery } from "@/lib/db/safe-query";

export const metadata = { title: "Edit Client" };

/** Reads a record and the session, so it must never be prerendered. */
export const dynamic = "force-dynamic";

export default async function EditClientPage({ params }: PageProps<"/clients/[clientId]/edit">) {
  /*
   * `clients:write`, not `clients:read`: this page exists only to submit a change, so
   * someone who cannot save should never be shown the form. The service checks it
   * again when the action runs, which is the boundary that matters.
   */
  await requirePagePermission("clients:write");

  const { clientId } = await params;

  const result = await safeQuery("client-edit", () => findClientById(clientId));

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Edit Client" />
        <Card>
          <ErrorState title="Client unavailable" description={result.message} />
        </Card>
      </>
    );
  }

  // A bad id in the URL is a 404, not an empty form that would create nothing.
  if (result.data === null) notFound();

  const client = result.data;

  return (
    <>
      <PageHeader
        title={`Edit ${client.name}`}
        description="Changes apply immediately and affect opportunity matching."
        breadcrumbs={[
          { label: "Clients", href: "/clients" },
          { label: client.name, href: `/clients/${client.id}` },
          { label: "Edit" },
        ]}
      />

      <div className="max-w-4xl">
        <ClientForm
          /*
           * The id is bound here, on the server. It is therefore not a form field the
           * browser could alter to edit a different client — the action receives it as
           * a closed-over argument.
           */
          action={updateClientAction.bind(null, client.id)}
          defaults={clientToFormValues(client)}
          submitLabel="Save Changes"
          cancelHref={`/clients/${client.id}`}
        />
      </div>
    </>
  );
}
