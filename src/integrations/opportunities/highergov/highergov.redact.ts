/**
 * Removes the API key from anything derived from a HigherGov response.
 *
 * NOT MERELY DEFENSIVE. The `document_path` field the API returns is a fully-formed
 * URL to their document endpoint with `api_key=<your live key>` already in the query
 * string. Storing the provider record verbatim — which is exactly what `rawData` is
 * for — therefore writes a working credential into every opportunity row, and from
 * there into every database backup and export.
 *
 * Pure and dependency-free so both the transport layer (logging) and the normalizer
 * (persistence) can use the same rule. Two different redaction implementations would
 * eventually disagree about which one covers the field that matters.
 */

const API_KEY_PARAM = /([?&]api_key=)[^&\s]*/gi;

/** Replaces the value of any `api_key` query parameter in a string. */
export function redactApiKey(value: string): string {
  return value.replace(API_KEY_PARAM, "$1<redacted>");
}

/**
 * Walks a decoded JSON value, redacting every string it contains.
 *
 * Recursive rather than a regex over the serialized JSON: operating on the parsed
 * structure cannot corrupt escaping, and it returns a value that is still safe to
 * store as JSON.
 */
export function redactApiKeyDeep<T>(value: T): T {
  if (typeof value === "string") return redactApiKey(value) as T;

  if (Array.isArray(value)) return value.map((entry) => redactApiKeyDeep(entry)) as T;

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) result[key] = redactApiKeyDeep(entry);
    return result as T;
  }

  return value;
}
