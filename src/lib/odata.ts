/**
 * OData query helpers for the 3CX XAPI.
 */

/** Escape a string literal for use inside an OData filter (single quote → doubled). */
export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Build a query string from raw params, skipping undefined values.
 * Values are URL-encoded. Returns "" or "?key=value&...".
 */
export function buildQuery(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

/**
 * Build an OData `contains()` OR-filter across several fields for one search term.
 * The term is escaped. Fields are trusted (hard-coded property names).
 */
export function buildContainsFilter(fields: string[], term: string): string {
  const escaped = escapeODataString(term);
  return fields.map((field) => `contains(${field},'${escaped}')`).join(" or ");
}
