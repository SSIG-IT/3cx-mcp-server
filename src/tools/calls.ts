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

type ResolvedTimeFilter =
  | { kind: "all_recent" }
  | { kind: "last_24_hours"; start: Date }
  | { kind: "local_date"; localDate: string; timezone: string };

const MAX_AUTO_SCAN_ROWS = 5000;
const MIN_TIME_WINDOW_SCAN_ROWS = 2000;

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

function resolveTimeFilter(query: RecentCallQuery): ResolvedTimeFilter {
  if (query.date) {
    return {
      kind: "local_date",
      localDate: query.date,
      timezone: query.timezone,
    };
  }

  if (query.scope === "all_recent") {
    return { kind: "all_recent" };
  }

  if (query.scope === "last_24_hours") {
    return {
      kind: "last_24_hours",
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
    };
  }

  return {
    kind: "local_date",
    localDate: getLocalDateString(new Date(), query.timezone),
    timezone: query.timezone,
  };
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

function matchesScope(entry: CallHistoryEntry, filter: ResolvedTimeFilter): boolean {
  if (filter.kind === "all_recent") return true;
  const timestamp = parseTimestamp(entry.SegmentStartTime);
  if (timestamp === null) return false;

  if (filter.kind === "last_24_hours") {
    return timestamp >= filter.start;
  }

  return getLocalDateString(timestamp, filter.timezone) === filter.localDate;
}

function shouldStopScanning(entry: CallHistoryEntry, filter: ResolvedTimeFilter): boolean {
  if (filter.kind === "all_recent") return false;

  const timestamp = parseTimestamp(entry.SegmentStartTime);
  if (timestamp === null) return false;

  if (filter.kind === "last_24_hours") {
    return timestamp < filter.start;
  }

  const entryDate = getLocalDateString(timestamp, filter.timezone);
  return entryDate < filter.localDate;
}

async function getCallHistoryPage(
  xapi: XapiClient,
  params: {
    top: number;
    skip?: number;
    orderby?: string;
  },
): Promise<CallHistoryEntry[]> {
  const query = buildCallHistoryQuery({
    $top: params.top,
    $skip: params.skip,
    $orderby: params.orderby ?? "SegmentStartTime desc",
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
    autoExpandedScan: boolean;
    windowFullyScanned: boolean;
    filteredLocally: true;
    timezone: string;
    notes: string[];
  };
  value: CallHistoryEntry[];
}> {
  const timeFilter = resolveTimeFilter(query);
  const collected: CallHistoryEntry[] = [];
  let scanned = 0;
  let skip = 0;
  let stopScanning = false;
  let reachedEndOfHistory = false;
  const effectiveScanLimit = timeFilter.kind === "all_recent"
    ? query.scanLimit
    : Math.min(MAX_AUTO_SCAN_ROWS, Math.max(query.scanLimit, MIN_TIME_WINDOW_SCAN_ROWS));

  while (scanned < effectiveScanLimit && collected.length < query.top && !stopScanning) {
    const remaining = effectiveScanLimit - scanned;
    const pageSize = Math.min(100, remaining);
    const page = await getCallHistoryPage(xapi, {
      top: pageSize,
      skip,
      orderby: "SegmentStartTime desc",
    });

    if (page.length === 0) {
      reachedEndOfHistory = true;
      break;
    }

    scanned += page.length;
    skip += page.length;

    for (const entry of page) {
      if (!matchesScope(entry, timeFilter)) {
        if (shouldStopScanning(entry, timeFilter)) {
          stopScanning = true;
          break;
        }
        continue;
      }

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
      if (collected.length >= query.top) {
        break;
      }
    }
  }

  return {
    meta: {
      scope: query.scope,
      date: timeFilter.kind === "local_date" ? timeFilter.localDate : undefined,
      scanLimit: query.scanLimit,
      scanned,
      returned: collected.length,
      autoExpandedScan: effectiveScanLimit > query.scanLimit,
      windowFullyScanned: timeFilter.kind === "all_recent" ? reachedEndOfHistory : stopScanning || reachedEndOfHistory,
      filteredLocally: true,
      timezone: query.timezone,
      notes: [
        "This tool always scans newest-first and applies scope filtering locally.",
        "3CX CallHistoryView date filters can fail with HTTP 500 on some systems, so no server-side date filter is used.",
        "For scope='today', the effective day boundary comes from the selected timezone, not necessarily the host timezone.",
        ...(effectiveScanLimit > query.scanLimit
          ? [`The scan was automatically expanded from ${query.scanLimit} to ${effectiveScanLimit} rows to cover the requested time window more reliably.`]
          : []),
        ...((timeFilter.kind !== "all_recent" && !(stopScanning || reachedEndOfHistory))
          ? ["The requested time window may not be fully covered yet. Increase scanLimit if you need exhaustive results on very busy systems."]
          : []),
      ],
    },
    value: collected,
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
      scope: z.enum(["today", "last_24_hours", "all_recent"]).optional().default("today").describe("Time window: 'today' (default), 'last_24_hours', or 'all_recent'"),
      missedOnly: z.boolean().optional().default(false).describe("Set true for missed/unanswered calls only"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Explicit date in YYYY-MM-DD format, e.g. '2026-03-17' for yesterday"),
      timezone: z.string().optional().describe(`IANA timezone, e.g. 'Europe/Berlin'. Defaults to ${defaultTimezone}.`),
      top: z.number().optional().default(20).describe("Max results to return"),
      extension: z.string().optional().describe("Filter by extension number on source or destination, e.g. '101'"),
      queue: z.string().optional().describe("Filter by queue number or name, e.g. '802' or 'Support'"),
      scanLimit: z.number().optional().default(250).describe("How many rows to scan. Increase for busy systems."),
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
