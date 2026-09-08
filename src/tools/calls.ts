import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import type { Config } from "../config.js";
import { z } from "zod";
import { formatListResponse } from "../lib/response-formatter.js";

/**
 * Call log entry from ReportCallLogData/Pbx.GetCallLogData (V20 U6+ CDR).
 * One logical call can span multiple segment rows sharing a MainCallHistoryId.
 */
type CallLogEntry = {
  MainCallHistoryId?: string;
  CallHistoryId?: string;
  CdrId?: string;
  CallId?: number;
  StartTime?: string;
  SourceDn?: string;
  SourceCallerId?: string;
  SourceDisplayName?: string;
  DestinationDn?: string;
  DestinationCallerId?: string;
  DestinationDisplayName?: string;
  ActionType?: number;
  RingingDuration?: string;
  TalkingDuration?: string;
  Answered?: boolean;
  Direction?: string;
  CallType?: string;
  Status?: string;
  Reason?: string;
  SegmentId?: number;
};

type CallScope = "today" | "last_24_hours" | "all_recent";

function getHostTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function getLocalDateString(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Could not resolve local date for timezone '${timezone}'.`);
  }

  return `${year}-${month}-${day}`;
}

/** Milliseconds by which `timezone` is ahead of UTC at the given instant. */
function tzOffsetMillis(date: Date, timezone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
  return asUtc - date.getTime();
}

function isoZ(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
}

/**
 * Convert a local calendar day (YYYY-MM-DD in `timezone`) to the UTC instants of
 * its start and end. CDR StartTime is UTC, so the report window must be UTC too.
 * A single offset refinement handles the rare DST-transition edge case.
 */
export function localDayRangeToUtc(
  dateStr: string,
  timezone: string,
): { periodFrom: string; periodTo: string } {
  const [year, month, day] = dateStr.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offset1 = tzOffsetMillis(new Date(guess), timezone);
  const start1 = guess - offset1;
  const offset2 = tzOffsetMillis(new Date(start1), timezone);
  const startUtc = guess - offset2;
  const endUtc = startUtc + 24 * 60 * 60 * 1000 - 1000; // 23:59:59 local
  return { periodFrom: isoZ(startUtc), periodTo: isoZ(endUtc) };
}

function parseTimestamp(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function matchesExactNumber(value: string | undefined, target: string): boolean {
  if (!value) return false;
  const normalizedValue = value.replace(/\s+/g, "").toLowerCase();
  const normalizedTarget = target.replace(/\s+/g, "").toLowerCase();
  return normalizedValue === normalizedTarget || normalizedValue === `ext.${normalizedTarget}`;
}

function matchesText(value: string | undefined, target: string): boolean {
  if (!value) return false;
  return value.toLowerCase().includes(target.toLowerCase());
}

export function matchesExtension(entry: CallLogEntry, extension?: string): boolean {
  if (!extension) return true;
  return (
    matchesExactNumber(entry.SourceDn, extension) ||
    matchesExactNumber(entry.DestinationDn, extension) ||
    matchesExactNumber(entry.SourceCallerId, extension) ||
    matchesExactNumber(entry.DestinationCallerId, extension)
  );
}

function matchesQueue(entry: CallLogEntry, queue?: string): boolean {
  if (!queue) return true;
  return (
    matchesExactNumber(entry.DestinationDn, queue) ||
    matchesText(entry.DestinationDisplayName, queue)
  );
}

/** True if any segment of the call was answered by someone. */
function callWasAnswered(segments: CallLogEntry[]): boolean {
  return segments.some((s) => s.Answered === true || s.Status === "Answered");
}

/**
 * Collapse segment rows into one representative row per logical call
 * (grouped by MainCallHistoryId). Prevents queue/ring-group calls from appearing
 * as multiple near-duplicate rows and makes missed-call detection correct:
 * a call is "missed" only if NONE of its segments was answered.
 */
export function collapseSegments(entries: CallLogEntry[]): CallLogEntry[] {
  const groups = new Map<string, CallLogEntry[]>();
  for (const entry of entries) {
    const key = entry.MainCallHistoryId ?? entry.CdrId ?? `${entry.CallId}-${entry.StartTime}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }

  const result: CallLogEntry[] = [];
  for (const segments of groups.values()) {
    segments.sort(
      (a, b) => (parseTimestamp(a.StartTime)?.getTime() ?? 0) - (parseTimestamp(b.StartTime)?.getTime() ?? 0),
    );
    const answered = callWasAnswered(segments);
    const representative: CallLogEntry = { ...(segments.find((s) => s.Status === "Answered") ?? segments[0]) };
    representative.StartTime = segments[0].StartTime; // earliest leg
    representative.Answered = answered;
    if (!answered) representative.Status = "Unanswered";
    result.push(representative);
  }
  return result;
}

/**
 * Build the date range for the ReportCallLogData function call.
 * All boundaries are UTC instants (CDR StartTime is UTC).
 */
function buildDateRange(
  scope: CallScope,
  date: string | undefined,
  timezone: string,
): { periodFrom: string; periodTo: string } {
  if (date) {
    return localDayRangeToUtc(date, timezone);
  }

  if (scope === "today") {
    return localDayRangeToUtc(getLocalDateString(new Date(), timezone), timezone);
  }

  if (scope === "last_24_hours") {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return {
      periodFrom: isoZ(yesterday.getTime()),
      periodTo: isoZ(now.getTime()),
    };
  }

  // all_recent: last 3 days (keeps report row counts and API calls reasonable).
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  return {
    periodFrom: localDayRangeToUtc(getLocalDateString(threeDaysAgo, timezone), timezone).periodFrom,
    periodTo: localDayRangeToUtc(getLocalDateString(now, timezone), timezone).periodTo,
  };
}

/**
 * Build the ReportCallLogData/Pbx.GetCallLogData() OData function URL.
 *
 * NOTE: we deliberately do NOT pass $orderby. Live testing showed $orderby on this
 * function is unreliable (it can omit the newest rows). The function's default order
 * is newest-first, so paging from skip=0 already yields the most recent calls; we
 * then sort client-side as a safety net.
 */
function buildGetCallLogDataUrl(periodFrom: string, periodTo: string, top: number, skip: number): string {
  const fnParams = [
    `periodFrom=${periodFrom}`,
    `periodTo=${periodTo}`,
    `sourceType=0`,
    `sourceFilter=''`,
    `destinationType=0`,
    `destinationFilter=''`,
    `callsType=0`,
    `callTimeFilterType=0`,
    `callTimeFilterFrom='0:00:0'`,
    `callTimeFilterTo='0:00:0'`,
    `hidePcalls=true`,
  ].join(",");

  return `/ReportCallLogData/Pbx.GetCallLogData(${fnParams})?$top=${top}&$skip=${skip}`;
}

type RecentCallQuery = {
  scope: CallScope;
  top: number;
  scanLimit: number;
  extension?: string;
  queue?: string;
  missedOnly: boolean;
  includeSegments: boolean;
  date?: string;
  timezone: string;
};

// 3CX caps report output at REPORT_ROW_LIMIT (default 20000, Settings → Parameters).
const REPORT_ROW_LIMIT = 20000;

async function queryRecentCalls(xapi: XapiClient, query: RecentCallQuery) {
  const { periodFrom, periodTo } = buildDateRange(query.scope, query.date, query.timezone);
  const rawSegments: CallLogEntry[] = [];
  let scanned = 0;
  let skip = 0;
  let reachedEnd = false;

  while (scanned < query.scanLimit && !reachedEnd) {
    const remaining = query.scanLimit - scanned;
    const pageSize = Math.min(100, remaining);
    const url = buildGetCallLogDataUrl(periodFrom, periodTo, pageSize, skip);
    const result = (await xapi.get(url)) as { value?: CallLogEntry[] };
    const page = result.value ?? [];

    if (page.length === 0) {
      reachedEnd = true;
      break;
    }

    scanned += page.length;
    skip += page.length;
    rawSegments.push(...page);
  }

  // One row per logical call (unless caller explicitly wants raw segments).
  const calls = query.includeSegments ? rawSegments : collapseSegments(rawSegments);

  const filtered = calls.filter((entry) => {
    if (query.missedOnly && entry.Answered !== false) return false;
    if (query.extension && !matchesExtension(entry, query.extension)) return false;
    if (query.queue && !matchesQueue(entry, query.queue)) return false;
    return true;
  });

  filtered.sort((a, b) => {
    const ta = parseTimestamp(a.StartTime)?.getTime() ?? 0;
    const tb = parseTimestamp(b.StartTime)?.getTime() ?? 0;
    return tb - ta; // newest first
  });

  const sliced = filtered.slice(0, query.top);
  const formatted = formatListResponse({ value: sliced }, "call_history");

  const effectiveDate =
    query.date ?? (query.scope === "today" ? getLocalDateString(new Date(), query.timezone) : undefined);

  const notes: string[] = [
    "Uses V20 U6+ ReportCallLogData endpoint (reads from cdr_output table).",
    query.includeSegments
      ? "Raw CDR segments (one row per call leg)."
      : "Segments grouped into one row per logical call (by MainCallHistoryId).",
    "Sorted newest-first.",
  ];
  if (reachedEnd) {
    notes.push("All matching records in the time window were retrieved.");
  } else {
    notes.push(
      `Scan limit (${query.scanLimit}) reached — older calls may exist. 3CX also caps reports at REPORT_ROW_LIMIT (default ${REPORT_ROW_LIMIT}); narrow the time window for exhaustive results.`,
    );
  }

  return {
    meta: {
      scope: query.scope,
      date: effectiveDate,
      timezone: query.timezone,
      window: { periodFrom, periodTo },
      scanLimit: query.scanLimit,
      scannedSegments: scanned,
      matchedCalls: filtered.length,
      returned: sliced.length,
      endpoint: "ReportCallLogData/Pbx.GetCallLogData",
      notes,
    },
    summary: formatted.summary,
    value: formatted.items,
  };
}

export function registerCallTools(server: McpServer, xapi: XapiClient, config: Config) {
  const defaultTimezone = config.TCX_TIMEZONE ?? getHostTimezone();

  server.registerTool(
    "get_active_calls",
    {
      title: "Get Active Calls",
      description:
        "Returns all currently active (live) calls on the 3CX system. Each call includes caller/callee info, duration, and status. Returns an empty list if no calls are in progress. Use this for 'who is on the phone right now?' questions.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const result = await xapi.get("/ActiveCalls");
        const formatted = formatListResponse(result, "active_call");
        return {
          content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_call_history",
    {
      title: "Get Call History",
      description:
        "Use this for ANY question about past calls: 'show today's calls', 'missed calls today', 'recent calls for extension 101', 'calls to queue 802 yesterday'. Returns newest calls first, one row per logical call. Each record: StartTime, SourceDisplayName, SourceCallerId, DestinationDisplayName, DestinationCallerId, Answered (true/false), TalkingDuration, Direction, Status, Reason. Set missedOnly=true for genuinely missed calls (calls no one answered). Timezone-aware 'today' filtering is automatic. Requires System Owner role. 3CX caps reports at 20000 rows; narrow the window for very busy periods.",
      inputSchema: {
        scope: z
          .enum(["today", "last_24_hours", "all_recent"])
          .optional()
          .default("today")
          .describe("Time window: 'today' (default), 'last_24_hours', or 'all_recent' (last 3 days)"),
        missedOnly: z
          .boolean()
          .optional()
          .default(false)
          .describe("Set true for genuinely missed calls only (no segment of the call was answered)"),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Explicit local date in YYYY-MM-DD format, e.g. '2026-03-17'"),
        timezone: z
          .string()
          .optional()
          .describe(`IANA timezone, e.g. 'Europe/Berlin'. Defaults to ${defaultTimezone}.`),
        top: z.number().optional().default(20).describe("Max results to return (applied after sorting)"),
        extension: z
          .string()
          .optional()
          .describe("Filter by extension number on source or destination, e.g. '101'"),
        queue: z.string().optional().describe("Filter by queue number or name, e.g. '802' or 'Support'"),
        includeSegments: z
          .boolean()
          .optional()
          .default(false)
          .describe("Return raw CDR segments (one row per call leg) instead of grouped calls"),
        scanLimit: z
          .number()
          .optional()
          .default(500)
          .describe("How many segment rows to fetch from the server. Increase for busy systems."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ scope, missedOnly, date, timezone, top, extension, queue, includeSegments, scanLimit }) => {
      try {
        const result = await queryRecentCalls(xapi, {
          scope,
          date,
          timezone: timezone ?? defaultTimezone,
          top,
          scanLimit,
          extension,
          queue,
          missedOnly,
          includeSegments,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
