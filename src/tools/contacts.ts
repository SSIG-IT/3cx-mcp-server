import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";

export function registerContactTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "list_contacts",
    "Lists contacts from the 3CX phonebook. Supports OData filtering and paging.",
    {
      filter: z.string().optional().describe("OData $filter expression, e.g. \"CompanyName eq 'Acme'\""),
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
        const result = await xapi.get(`/Contacts${query}`);
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
    "search_contacts",
    "Searches the 3CX phonebook by name, company, or phone number.",
    {
      query: z.string().describe("Search term to match against FirstName, LastName, CompanyName, or Business phone"),
    },
    async ({ query }) => {
      try {
        const q = query.replace(/'/g, "''");
        const filter = `contains(FirstName,'${q}') or contains(LastName,'${q}') or contains(CompanyName,'${q}') or contains(Business,'${q}') or contains(PhoneNumber,'${q}')`;
        const result = await xapi.get(`/Contacts?$filter=${encodeURIComponent(filter)}`);
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
