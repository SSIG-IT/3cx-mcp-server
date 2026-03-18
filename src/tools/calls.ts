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

  while (scanned < query.scanLimit && collected.length < query.top && !stopScanning) {
    const remaining = query.scanLimit - scanned;
    const pageSize = Math.min(100, remaining);
    const page = await getCallHistoryPage(xapi, {
      top: pageSize,
      skip,
      orderby: "SegmentStartTime desc",
    });

    if (page.length === 0) {
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
      filteredLocally: true,
      timezone: query.timezone,
      notes: [
        "This tool always scans newest-first and applies scope filtering locally.",
        "3CX CallHistoryView date filters can fail with HTTP 500 on some systems, so no server-side date filter is used.",
        "For scope='today', the effective day boundary comes from the selected timezone, not necessarily the host timezone.",
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
    "get_call_logs",
    "Low-level/raw call history (CDR) endpoint for power users. Returns newest first by default. Each record has: SegmentStartTime, SegmentEndTime, SrcDisplayName, SrcCallerNumber, DstDisplayName, DstCallerNumber, CallTime (duration), CallAnswered (boolean). Prefer get_recent_calls or get_recent_missed_calls for AI-friendly queries because they avoid fragile OData date filters. Useful filters: \"CallAnswered eq false\" for missed calls, \"SrcCallerNumber eq 'Ext.101'\" for calls from extension 101. IMPORTANT: Date filters on SegmentStartTime cause 500 errors on some 3CX versions — use top/orderby or the structured helper tools instead. Requires System Owner role (returns 403 with System Administrator).",
    {
      filter: z.string().optional().describe("OData $filter, e.g. \"CallAnswered eq false\" for missed calls, or \"DstCallerNumber eq '802'\" for calls to queue 802"),
      top: z.number().optional().default(50).describe("Max results (default 50). Use higher values to get more history."),
      skip: z.number().optional().describe("Skip N results for paging"),
      orderby: z.string().optional().default("SegmentStartTime desc").describe("Sort order. Default: newest first. Use 'SegmentStartTime asc' for oldest first."),
    },
    async ({ filter, top, skip, orderby }) => {
      try {
        const params = new URLSearchParams();
        if (filter) params.set("$filter", filter);
        if (top !== undefined) params.set("$top", String(top));
        if (skip !== undefined) params.set("$skip", String(skip));
        if (orderby) params.set("$orderby", orderby);
        const query = params.toString() ? `?${params}` : "";
        const result = await xapi.get(`/CallHistoryView${query}`);
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
    "get_recent_calls",
    "AI-friendly call history lookup with structured parameters instead of raw OData. Use this for questions like 'show today's calls', 'recent calls for extension 101', or 'recent calls for queue 802'. The tool always reads call history newest-first and applies time filtering locally to avoid known 3CX date-filter bugs. For calendar-day queries, the day boundary comes from the selected timezone.",
    {
      scope: z.enum(["today", "last_24_hours", "all_recent"]).optional().default("today").describe("Time window. If date is not set, 'today' uses the selected timezone."),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Optional explicit local calendar date in YYYY-MM-DD format. Overrides the implicit 'today' date boundary."),
      timezone: z.string().optional().describe(`IANA timezone for calendar-day queries, e.g. 'Europe/Berlin'. Defaults to ${defaultTimezone}.`),
      top: z.number().optional().default(20).describe("Maximum matching calls to return."),
      extension: z.string().optional().describe("Optional extension number to match on source or destination caller number, e.g. '101'."),
      queue: z.string().optional().describe("Optional queue number or queue name to match on the destination side, e.g. '802' or 'Support'."),
      scanLimit: z.number().optional().default(250).describe("How many newest call-log rows to scan before local filtering. Increase on very busy systems."),
    },
    async ({ scope, date, timezone, top, extension, queue, scanLimit }) => {
      try {
        const result = await queryRecentCalls(xapi, {
          scope,
          date,
          timezone: timezone ?? defaultTimezone,
          top,
          scanLimit,
          extension,
          queue,
          missedOnly: false,
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

  server.tool(
    "get_recent_missed_calls",
    "Best choice for AI agents asking about missed calls. Use this for 'missed calls today', 'missed calls for extension 101', or 'missed calls for queue 802'. The tool scans newest-first and filters locally, so it works around the 3CX CallHistoryView date-filter bug. For calendar-day queries, the day boundary comes from the selected timezone.",
    {
      scope: z.enum(["today", "last_24_hours", "all_recent"]).optional().default("today").describe("Time window. If date is not set, 'today' uses the selected timezone."),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Optional explicit local calendar date in YYYY-MM-DD format. Overrides the implicit 'today' date boundary."),
      timezone: z.string().optional().describe(`IANA timezone for calendar-day queries, e.g. 'Europe/Berlin'. Defaults to ${defaultTimezone}.`),
      top: z.number().optional().default(20).describe("Maximum matching missed calls to return."),
      extension: z.string().optional().describe("Optional extension number to match on source or destination caller number, e.g. '101'."),
      queue: z.string().optional().describe("Optional queue number or queue name to match on the destination side, e.g. '802' or 'Support'."),
      scanLimit: z.number().optional().default(250).describe("How many newest call-log rows to scan before local filtering. Increase on very busy systems."),
    },
    async ({ scope, date, timezone, top, extension, queue, scanLimit }) => {
      try {
        const result = await queryRecentCalls(xapi, {
          scope,
          date,
          timezone: timezone ?? defaultTimezone,
          top,
          scanLimit,
          extension,
          queue,
          missedOnly: true,
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
