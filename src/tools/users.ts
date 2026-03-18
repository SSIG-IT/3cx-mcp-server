import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";

export function registerUserTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "list_users",
    "Lists all 3CX users. Supports OData filtering and paging.",
    {
      filter: z.string().optional().describe("OData $filter expression, e.g. \"FirstName eq 'Max'\""),
      top: z.number().optional().describe("Maximum number of results to return"),
      skip: z.number().optional().describe("Number of results to skip (paging)"),
    },
    async ({ filter, top, skip }) => {
      try {
        const params = new URLSearchParams();
        if (filter) params.set("$filter", filter);
        if (top !== undefined) params.set("$top", String(top));
        if (skip !== undefined) params.set("$skip", String(skip));
        const query = params.toString() ? `?${params}` : "";
        const result = await xapi.get(`/Users${query}`);
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
    "get_user",
    "Retrieves a single 3CX user by their ID.",
    {
      id: z.number().describe("The user ID"),
    },
    async ({ id }) => {
      try {
        const result = await xapi.get(`/Users(${id})`);
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
