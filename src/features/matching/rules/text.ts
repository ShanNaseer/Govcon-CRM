/**
 * Shared text handling for the keyword rules.
 *
 * Separate module because the matching rules must agree on what "the opportunity
 * mentions X" means — two rules disagreeing about case or word boundaries would make
 * a positive and a negative keyword behave inconsistently on the same text.
 */

/** Lower-cased haystack built from the fields a keyword could plausibly appear in. */
export function searchableText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n")
    .toLowerCase();
}

/**
 * Whether `haystack` mentions `phrase` as whole words.
 *
 * Word boundaries, not `includes`. A substring test makes short keywords behave
 * absurdly — the client profile in this workspace carries the negative keyword "nil",
 * which as a substring would disqualify anything mentioning "Nilsson" or "nil-value".
 * Multi-word phrases ("cloud migration") are matched with flexible whitespace so a
 * line break between the words still counts.
 */
export function mentions(haystack: string, phrase: string): boolean {
  const cleaned = phrase.trim().toLowerCase();
  if (cleaned === "") return false;

  const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

  // \b is unreliable next to non-word characters (C++, 8(a)), so the boundary is
  // expressed as "not preceded/followed by a word character".
  return new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "i").test(haystack);
}
