import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";

export function registerLogTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "get_event_logs",
    "Retrieves system event logs from the 3CX system. Supports OData filtering and paging.",
    {
      filter: z.string().optional().describe("OData $filter expression, e.g. \"Type eq 'Error'\""),
      top: z.number().optional().default(50).describe("Maximum number of results (default: 50)"),
      skip: z.number().optional().describe("Number of results to skip (paging)"),
    },
    async ({ filter, top, skip }) => {
      try {
        const params = new URLSearchParams();
        if (filter) params.set("$filter", filter);
        if (top !== undefined) params.set("$top", String(top));
        if (skip !== undefined) params.set("$skip", String(skip));
        const query = params.toString() ? `?${params}` : "";
        const result = await xapi.get(`/EventLogs${query}`);
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
