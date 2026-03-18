import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import type { Config } from "../config.js";
import { z } from "zod";

type CallHistoryEntry = {
  SegmentStartTime?: string;
  SegmentEndTime?: string;
  SrcDisplayName?: string;
  SrcCallerNumber?: string;
  DstDisplayName?: string;
  DstCallerNumber?: string;
  CallAnswered?: boolean;
};

type CallHistoryResponse = {
  value?: CallHistoryEntry[];
};

type CallScope = "today" | "last_24_hours" | "all_recent";

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

function buildCallHistoryQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

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

function matchesExtension(entry: CallHistoryEntry, extension?: string): boolean {
  if (!extension) return true;

  return (
    matchesExactNumber(entry.SrcCallerNumber, extension) ||
    matchesExactNumber(entry.DstCallerNumber, extension)
  );
}

function matchesQueue(entry: CallHistoryEntry, queue?: string): boolean {
  if (!queue) return true;

  return matchesExactNumber(entry.DstCallerNumber, queue) || matchesText(entry.DstDisplayName, queue);
}

/**
 * Build a server-side OData $filter for CallHistoryView.
 *
 * 3CX XAPI ignores $orderby on CallHistoryView — $skip/$top always operate
 * on the native (ascending / oldest-first) order. Without a $filter the first
 * page therefore returns the *oldest* records in the database, not the newest.
 *
 * The date() function syntax is the most reliable across 3CX V20 instances:
 *   $filter=date(SegmentStartTime) ge 2026-03-18
 */
function buildDateFilter(scope: CallScope, date: string | undefined, timezone: string): string | undefined {
  if (date) {
    return `date(SegmentStartTime) eq ${date}`;
  }

  if (scope === "today") {
    const today = getLocalDateString(new Date(), timezone);
    return `date(SegmentStartTime) eq ${today}`;
  }

  if (scope === "last_24_hours") {
    const yesterday = getLocalDateString(new Date(Date.now() - 24 * 60 * 60 * 1000), timezone);
    return `date(SegmentStartTime) ge ${yesterday}`;
  }

  // all_recent: last 7 days as a reasonable default
  const weekAgo = getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), timezone);
  return `date(SegmentStartTime) ge ${weekAgo}`;
}

async function getCallHistoryPage(
  xapi: XapiClient,
  params: {
    top: number;
    skip?: number;
    filter?: string;
  },
): Promise<CallHistoryEntry[]> {
  const query = buildCallHistoryQuery({
    $top: params.top,
    $skip: params.skip,
    $filter: params.filter,
  });
  const result = (await xapi.get(`/CallHistoryView${query}`)) as CallHistoryResponse;
  return result.value ?? [];
}

async function queryRecentCalls(xapi: XapiClient, query: RecentCallQuery): Promise<{
  meta: {
    scope: CallScope;
    date?: string;
    scanLimit: number;
    scanned: number;
    returned: number;
    timezone: string;
    serverFilter: string | undefined;
    notes: string[];
  };
  value: CallHistoryEntry[];
}> {
  const dateFilter = buildDateFilter(query.scope, query.date, query.timezone);
  const collected: CallHistoryEntry[] = [];
  let scanned = 0;
  let skip = 0;
  let reachedEnd = false;

  while (scanned < query.scanLimit && !reachedEnd) {
    const remaining = query.scanLimit - scanned;
    const pageSize = Math.min(100, remaining);
    const page = await getCallHistoryPage(xapi, {
      top: pageSize,
      skip,
      filter: dateFilter,
    });

    if (page.length === 0) {
      reachedEnd = true;
      break;
    }

    scanned += page.length;
    skip += page.length;

    for (const entry of page) {
      if (query.missedOnly && entry.CallAnswered !== false) {
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

  // Sort client-side newest-first (3CX ignores $orderby on CallHistoryView)
  collected.sort((a, b) => {
    const ta = parseTimestamp(a.SegmentStartTime)?.getTime() ?? 0;
    const tb = parseTimestamp(b.SegmentStartTime)?.getTime() ?? 0;
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
      serverFilter: dateFilter,
      notes: [
        "Server-side $filter narrows the date range; results are sorted client-side (newest first).",
        "3CX XAPI ignores $orderby on CallHistoryView, so $filter is required to get recent data.",
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
    "Use this for ANY question about past calls: 'show today's calls', 'missed calls today', 'recent calls for extension 101', 'calls to queue 802 yesterday'. Returns newest calls first. Each record: SegmentStartTime, SrcDisplayName, SrcCallerNumber, DstDisplayName, DstCallerNumber, CallAnswered (true/false), CallTime. Set missedOnly=true for missed/unanswered calls. Handles timezone-aware 'today' filtering automatically. Requires System Owner role.",
    {
      scope: z.enum(["today", "last_24_hours", "all_recent"]).optional().default("today").describe("Time window: 'today' (default, server-filtered), 'last_24_hours' (server-filtered), or 'all_recent' (last 7 days)"),
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
