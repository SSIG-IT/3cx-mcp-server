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

  server.tool(
    "create_department",
    "[DESTRUCTIVE] Creates a new department (group) in the 3CX system.",
    {
      Name: z.string().describe("Department name"),
      Language: z.string().optional().describe("Language code (e.g. 'de', 'en')"),
      TimeZoneId: z.string().optional().describe("Time zone ID (e.g. 'W. Europe Standard Time')"),
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = { Name: params.Name };
        if (params.Language) body.Language = params.Language;
        if (params.TimeZoneId) body.TimeZoneId = params.TimeZoneId;
        const result = await xapi.post("/Groups", body);
        return {
          content: [{
            type: "text",
            text: `Department created successfully:\n${JSON.stringify(result, null, 2)}`,
          }],
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
    "update_department",
    "[DESTRUCTIVE] Updates an existing department (group). Only provided fields will be changed.",
    {
      id: z.number().describe("The numeric department/group ID"),
      Name: z.string().optional().describe("Department name"),
      Language: z.string().optional().describe("Language code"),
      TimeZoneId: z.string().optional().describe("Time zone ID"),
    },
    async ({ id, ...fields }) => {
      try {
        const body: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) body[key] = value;
        }
        if (Object.keys(body).length === 0) {
          return {
            content: [{ type: "text", text: "Error: No fields to update provided." }],
            isError: true,
          };
        }
        await xapi.patch(`/Groups(${id})`, body);
        const updated = await xapi.get(`/Groups(${id})`);
        return {
          content: [{
            type: "text",
            text: `Department ${id} updated successfully:\n${JSON.stringify(updated, null, 2)}`,
          }],
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
