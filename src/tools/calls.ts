import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";

export function registerCallTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "get_active_calls",
    "Retrieves currently active calls on the 3CX system.",
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
    "Retrieves call history (CDR) from the 3CX system, newest first. Supports OData filtering on fields like CallAnswered (boolean), SrcDisplayName, DstDisplayName, SrcCallerNumber, DstCallerNumber. NOTE: Date filters on SegmentStartTime cause 500 errors on some 3CX versions — use $top to limit results instead. Requires System Owner role.",
    {
      filter: z.string().optional().describe("OData $filter expression, e.g. \"CallAnswered eq false\" for missed calls"),
      top: z.number().optional().default(50).describe("Maximum number of results (default: 50)"),
      skip: z.number().optional().describe("Number of results to skip (paging)"),
      orderby: z.string().optional().default("SegmentStartTime desc").describe("OData $orderby expression (default: newest first)"),
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
}
