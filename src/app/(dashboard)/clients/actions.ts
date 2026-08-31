"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  echoClientForm,
  parseClientEditForm,
  parseClientForm,
} from "@/features/clients/client.form";
import { clientIdSchema } from "@/features/clients/client.schemas";
import {
  createClient,
  deleteClient,
  getClientDeletionImpact,
  updateClient,
} from "@/features/clients/client.service";
import { AppError } from "@/lib/api/errors";
import { describeError, logger } from "@/lib/logger";

/**
 * Client creation.
 *
 * Validation is the same `createClientSchema` the API route uses, and the write
 * goes through the same service function — which calls `requireSession()` before
 * touching the database. There is no second, form-shaped validation path that
 * could drift from the API's rules.
 *
 * The form-to-input mapping lives in client.form.ts so it can be tested without a
 * request context; this module is only the request-bound glue.
 */

export type ClientFormState = {
  /** Message shown above the form. */
  error?: string;
  /** Per-field messages, keyed by form field name. */
  fieldErrors?: Record<string, string[]>;
  /** Echoed back so a rejected submission does not clear the user's typing. */
  values?: Record<string, string>;
};

export async function createClientAction(
  _previousState: ClientFormState | null,
  formData: FormData,
): Promise<ClientFormState> {
  const values = echoClientForm(formData);
  const parsed = parseClientForm(formData);

  if (!parsed.success) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  let createdId: string;

  try {
    const created = await createClient(parsed.data);
    createdId = created.id;
  } catch (error) {
    // A duplicate UEI or an inconsistent profile is user-correctable, not a fault.
    if (error instanceof AppError) return { error: error.message, values };

    logger.error("Client creation failed", describeError(error));
    return { error: "Could not save this client right now. Please try again.", values };
  }

  revalidatePath("/clients");
  revalidatePath("/");

  // Outside the try block: `redirect` unwinds by throwing.
  redirect(`/clients/${createdId}`);
}

/**
 * Client edit.
 *
 * Same form, same field mapping, same service the API route uses. The one difference
 * from creation is the schema: `parseClientEditForm` validates against
 * `updateClientSchema`, so the collections this form has no inputs for are left
 * untouched rather than emptied. See the note on that function.
 *
 * `clientId` is bound on the server by the page, not posted with the form — a hidden
 * id field would be a value the browser could change, and this action would then edit
 * whichever client the browser named.
 */
export async function updateClientAction(
  clientId: string,
  _previousState: ClientFormState | null,
  formData: FormData,
): Promise<ClientFormState> {
  const values = echoClientForm(formData);

  const parsedId = clientIdSchema.safeParse(clientId);
  if (!parsedId.success) return { error: "That client reference is not valid.", values };

  const parsed = parseClientEditForm(formData);

  if (!parsed.success) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  try {
    await updateClient(parsedId.data, parsed.data);
  } catch (error) {
    // A duplicate UEI or an inconsistent profile is user-correctable, not a fault.
    if (error instanceof AppError) return { error: error.message, values };

    logger.error("Client update failed", { clientId, ...describeError(error) });
    return { error: "Could not save this client right now. Please try again.", values };
  }

  /*
   * Both the list and the detail page read this record, and the dashboard counts
   * clients by status.
   */
  revalidatePath("/clients");
  revalidatePath(`/clients/${parsedId.data}`);

  // Back to the record just edited, which is where someone expects to land.
  redirect(`/clients/${parsedId.data}`);
}

export type DeleteClientResult = { ok: true } | { ok: false; error: string };

/**
 * Client deletion.
 *
 * IRREVERSIBLE, AND WIDER THAN IT LOOKS. Ten tables cascade from `Client`, including
 * `Task` and `OpportunityMatch` — so this destroys the team's work items for the
 * client and the matching engine's output, not just the profile. The confirmation
 * dialog states the counts before the user commits; the service logs them afterwards,
 * because the cascade leaves nothing behind to reconstruct them from.
 *
 * No redirect on success. The caller navigates, so a failure can be shown in place
 * rather than on a page that has already changed.
 */
export async function deleteClientAction(clientId: string): Promise<DeleteClientResult> {
  const parsedId = clientIdSchema.safeParse(clientId);
  if (!parsedId.success) return { ok: false, error: "That client reference is not valid." };

  try {
    await deleteClient(parsedId.data);
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };

    logger.error("Client deletion failed", { clientId, ...describeError(error) });
    return { ok: false, error: "Could not delete this client right now. Please try again." };
  }

  revalidatePath("/clients");
  // The dashboard counts clients by status, and tasks may have gone with this one.
  revalidatePath("/");
  revalidatePath("/tasks");

  return { ok: true };
}

export type DeletionImpact = { tasks: number; matches: number; profileRecords: number };

export type DeletionImpactResult =
  | { ok: true; impact: DeletionImpact }
  | { ok: false; error: string };

/**
 * What deleting this client would destroy, fetched when the dialog opens.
 *
 * ON DEMAND, not with the page. Ten counts per client is a real cost on a remote
 * pooled connection (~300ms a round trip), and a list of clients would pay it for
 * every row while almost every visit deletes nothing. Loading it at the moment
 * someone actually asks to delete costs one query and only when it matters.
 */
export async function clientDeletionImpactAction(clientId: string): Promise<DeletionImpactResult> {
  const parsedId = clientIdSchema.safeParse(clientId);
  if (!parsedId.success) return { ok: false, error: "That client reference is not valid." };

  try {
    return { ok: true, impact: await getClientDeletionImpact(parsedId.data) };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };

    logger.error("Deletion impact lookup failed", { clientId, ...describeError(error) });
    return { ok: false, error: "Could not check what this delete would affect." };
  }
}
