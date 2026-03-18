import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";

export function registerDepartmentTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "list_departments",
    "Lists all 3CX departments (groups). Supports OData filtering.",
    {
      filter: z.string().optional().describe("OData $filter expression, e.g. \"Name eq 'Sales'\""),
    },
    async ({ filter }) => {
      try {
        const params = new URLSearchParams();
        if (filter) params.set("$filter", filter);
        const query = params.toString() ? `?${params}` : "";
        const result = await xapi.get(`/Groups${query}`);
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
