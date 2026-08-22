import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Add Client" };

/** Reads the session, so it must never be prerendered. */
export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  // The write itself is authorized in the service layer; this only stops an
  // unauthenticated visitor being shown a form they could never submit.
  await requireUser();

  return (
    <>
      <PageHeader
        title="Add Client"
        description="Create a company profile for opportunity matching."
        breadcrumbs={[{ label: "Clients", href: "/clients" }, { label: "Add Client" }]}
      />

      <div className="max-w-4xl">
        <ClientForm />
      </div>
    </>
  );
}
