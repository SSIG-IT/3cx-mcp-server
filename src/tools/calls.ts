import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import type { Config } from "../config.js";
import { z } from "zod";

/**
 * Call log entry from ReportCallLogData/Pbx.GetCallLogData (V20 U6+ CDR).
 */
type CallLogEntry = {
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

type CallLogResponse = {
  value?: CallLogEntry[];
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

function matchesExtension(entry: CallLogEntry, extension?: string): boolean {
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

/**
 * Build the date range for the ReportCallLogData function call.
 */
function buildDateRange(scope: CallScope, date: string | undefined, timezone: string): { periodFrom: string; periodTo: string } {
  if (date) {
    return {
      periodFrom: `${date}T00:00:00Z`,
      periodTo: `${date}T23:59:59Z`,
    };
  }

  if (scope === "today") {
    const today = getLocalDateString(new Date(), timezone);
    return {
      periodFrom: `${today}T00:00:00Z`,
      periodTo: `${today}T23:59:59Z`,
    };
  }

  if (scope === "last_24_hours") {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return {
      periodFrom: yesterday.toISOString().replace(/\.\d+Z$/, "Z"),
      periodTo: now.toISOString().replace(/\.\d+Z$/, "Z"),
    };
  }

  // all_recent: last 7 days
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    periodFrom: `${getLocalDateString(weekAgo, timezone)}T00:00:00Z`,
    periodTo: `${getLocalDateString(now, timezone)}T23:59:59Z`,
  };
}

/**
 * Build the full ReportCallLogData/Pbx.GetCallLogData() OData function URL.
 *
 * This is the V20 U6+ endpoint that reads from the new cdr_output table.
 * CallHistoryView only contains pre-U6 data on upgraded systems.
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
  date?: string;
  timezone: string;
};

async function queryRecentCalls(xapi: XapiClient, query: RecentCallQuery): Promise<{
  meta: {
    scope: CallScope;
    date?: string;
    scanLimit: number;
    scanned: number;
    returned: number;
    timezone: string;
    endpoint: string;
    notes: string[];
  };
  value: CallLogEntry[];
}> {
  const { periodFrom, periodTo } = buildDateRange(query.scope, query.date, query.timezone);
  const collected: CallLogEntry[] = [];
  let scanned = 0;
  let skip = 0;
  let reachedEnd = false;

  while (scanned < query.scanLimit && !reachedEnd) {
    const remaining = query.scanLimit - scanned;
    const pageSize = Math.min(100, remaining);
    const url = buildGetCallLogDataUrl(periodFrom, periodTo, pageSize, skip);
    const result = (await xapi.get(url)) as CallLogResponse;
    const page = result.value ?? [];

    if (page.length === 0) {
      reachedEnd = true;
      break;
    }

    scanned += page.length;
    skip += page.length;

    for (const entry of page) {
      if (query.missedOnly && entry.Answered !== false) {
        continue;
      }

      if (!matchesExtension(entry, query.extension)) {
        continue;
      }

      if (!matchesQueue(entry, query.queue)) {
        continue;
      }

      collected.push(entry);
    }
  }

  // Sort client-side newest-first
  collected.sort((a, b) => {
    const ta = parseTimestamp(a.StartTime)?.getTime() ?? 0;
    const tb = parseTimestamp(b.StartTime)?.getTime() ?? 0;
    return tb - ta;
  });

  // Apply top limit after sorting
  const result = collected.slice(0, query.top);
  const effectiveDate = query.date
    ?? (query.scope === "today" ? getLocalDateString(new Date(), query.timezone) : undefined);

  return {
    meta: {
      scope: query.scope,
      date: effectiveDate,
      scanLimit: query.scanLimit,
      scanned,
      returned: result.length,
      timezone: query.timezone,
      endpoint: "ReportCallLogData/Pbx.GetCallLogData",
      notes: [
        "Uses V20 U6+ ReportCallLogData endpoint (reads from cdr_output table).",
        "Results are sorted client-side (newest first).",
        ...(reachedEnd
          ? ["All matching records in the time window were retrieved."]
          : [`Scan limit (${query.scanLimit}) reached. Increase scanLimit for exhaustive results on busy systems.`]),
      ],
    },
    value: result,
  };
}

export function registerCallTools(server: McpServer, xapi: XapiClient, config: Config) {
  const defaultTimezone = config.TCX_TIMEZONE ?? getHostTimezone();

  server.tool(
    "get_active_calls",
    "Returns all currently active (live) calls on the 3CX system. Each call includes caller/callee info, duration, and status. Returns an empty array if no calls are in progress. Use this for 'who is on the phone right now?' questions.",
    {},
    async () => {
      try {
        const result = await xapi.get("/ActiveCalls");
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

  server.tool(
    "get_call_history",
    "Use this for ANY question about past calls: 'show today's calls', 'missed calls today', 'recent calls for extension 101', 'calls to queue 802 yesterday'. Returns newest calls first. Each record: StartTime, SourceDisplayName, SourceCallerId, DestinationDisplayName, DestinationCallerId, Answered (true/false), TalkingDuration, Direction, Status, Reason. Set missedOnly=true for missed/unanswered calls. Handles timezone-aware 'today' filtering automatically. Requires System Owner role.",
    {
      scope: z.enum(["today", "last_24_hours", "all_recent"]).optional().default("today").describe("Time window: 'today' (default), 'last_24_hours', or 'all_recent' (last 7 days)"),
      missedOnly: z.boolean().optional().default(false).describe("Set true for missed/unanswered calls only"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Explicit date in YYYY-MM-DD format, e.g. '2026-03-17' for yesterday"),
      timezone: z.string().optional().describe(`IANA timezone, e.g. 'Europe/Berlin'. Defaults to ${defaultTimezone}.`),
      top: z.number().optional().default(20).describe("Max results to return (applied after sorting)"),
      extension: z.string().optional().describe("Filter by extension number on source or destination, e.g. '101'"),
      queue: z.string().optional().describe("Filter by queue number or name, e.g. '802' or 'Support'"),
      scanLimit: z.number().optional().default(500).describe("How many rows to fetch from the server. Increase for busy systems."),
    },
    async ({ scope, missedOnly, date, timezone, top, extension, queue, scanLimit }) => {
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
