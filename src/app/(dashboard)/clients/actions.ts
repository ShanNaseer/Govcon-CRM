"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { echoClientForm, parseClientForm } from "@/features/clients/client.form";
import { createClient } from "@/features/clients/client.service";
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
