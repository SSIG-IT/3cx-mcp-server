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
        // Try dedicated endpoint first, fall back to SystemStatus
        try {
          const result = await xapi.get("/ReportActiveCalls");
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch {
          const status = await xapi.get("/SystemStatus") as Record<string, unknown>;
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ ActiveCalls: status.CallsActive ?? status }, null, 2),
            }],
          };
        }
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
    "Retrieves call log data (CDR) from the 3CX system. Supports OData filtering.",
    {
      filter: z.string().optional().describe("OData $filter expression for call logs"),
      top: z.number().optional().default(50).describe("Maximum number of results (default: 50)"),
    },
    async ({ filter, top }) => {
      try {
        const params = new URLSearchParams();
        if (filter) params.set("$filter", filter);
        if (top !== undefined) params.set("$top", String(top));
        const query = params.toString() ? `?${params}` : "";
        const result = await xapi.get(`/ReportCallLogData${query}`);
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
