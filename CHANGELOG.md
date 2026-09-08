# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.3.0] — 2026-09-08

Hardening & correctness release. Full scan of the server against the live 3CX XAPI
(V20.0.10) plus modern MCP best practices. No breaking changes to tool names or
required inputs; `get_call_history` output shape changed (see Changed).

### Fixed

- **Call-history timezone bug.** CDR `StartTime` is UTC, but `scope="today"` built the
  report window from a local date labelled with `Z`, shifting the window by the UTC
  offset (e.g. missing 00:00–02:00 in `Europe/Berlin`). Day boundaries are now mapped
  to true UTC instants (`localDayRangeToUtc`), DST-aware.
- **`missedOnly` massively over-counted.** A queue/ring-group call produces several CDR
  segments; a segment with `Status="Unanswered"` does **not** mean the call was missed.
  Live data showed 22 false positives vs 3 real misses. Segments are now grouped by
  `MainCallHistoryId`; a call counts as missed only when **no** segment was answered.
- **OData injection / breakage.** `get_user`, `get_extension_status` and both forwarding
  tools interpolated the extension into `$filter` without escaping — an apostrophe threw
  a 400. All string literals are now escaped (`escapeODataString`).
- **`get_trunk_details` returned a stripped record** despite promising full config; it now
  returns the complete trunk object.
- **`delete_user` payload** used `{ ids }`; the documented 3CX field is `{ Ids }`.
- **Stale token on 401.** A server-side token revocation left every call failing until
  local expiry. The client now invalidates the cache on 401 and retries once.

### Added

- **Server-side user search.** `find_users` now filters via OData `contains()` + `$count`
  instead of scanning up to 250 rows locally. An empty query lists all users (use with
  `onlyRegistered` for "who is online?").
- **Credential redaction.** `get_user` / `update_user` mask `AuthPassword`,
  `DeskphonePassword` and `VMPIN` so secrets never enter the model context.
- **HTTP transport hardening.** Binds to `127.0.0.1` by default, enables DNS-rebinding
  protection with an allow-list (`MCP_ALLOWED_HOSTS`), and shares one token across
  requests. Authentication is expected from a fronting proxy (e.g. mcphub OAuth).
- **Tool annotations.** All 22 tools migrated to `server.registerTool` with
  `readOnlyHint` / `destructiveHint` / `idempotentHint` hints and titles.
- **20 000-row report cap documented.** 3CX caps reports at `REPORT_ROW_LIMIT`
  (default 20 000, raisable to 80 000 in Settings → Parameters). Surfaced in the tool
  description and `meta.notes`; narrow the time window for very busy periods.
- **Unit tests (Vitest).** 23 tests covering OData escaping, timezone/day-range math,
  call-segment grouping, user ranking, credential redaction and response formatting.
  Run with `npm test`.
- **Structured stderr logger** honouring `MCP_LOG_LEVEL` (never writes to stdout).
- **Config:** `MCP_HTTP_PORT`, `MCP_HTTP_HOST`, `MCP_ALLOWED_HOSTS` are now validated
  in the Zod schema.

### Changed

- `get_call_history` returns **one row per logical call** (grouped, newest-first) with a
  compact field set; pass `includeSegments=true` for raw CDR segments. It no longer sends
  `$orderby` — live testing showed 3CX's `$orderby` on this function is unreliable and can
  drop the newest rows; the function's default order is newest-first and the server sorts
  client-side as a safety net.
- Response compaction is applied consistently (active calls, ring groups, call history);
  `total` / `hasMore` now come from `@odata.count` when available.

### Notes / not yet verified

- Write tools (`create_user`, `update_user`, `delete_user`, `set_forwarding_profile`,
  `create_department`, `update_department`) are code-verified, typed, built and annotated
  but were **not** executed against production. `create_user` uses a minimal payload;
  `$metadata` shows the extra fields as nullable.

## [0.2.0]

- Initial public release: 22 MCP tools over stdio/http, OAuth2 client-credentials auth,
  compact response formatting, timezone-aware call history via ReportCallLogData.
