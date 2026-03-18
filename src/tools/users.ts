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
    "Retrieves a single 3CX user by extension number (e.g. '101').",
    {
      extension: z.string().describe("The extension number (e.g. '101')"),
    },
    async ({ extension }) => {
      try {
        const result = await xapi.get(`/Users?$filter=Number eq '${extension}'`) as { value?: unknown[] };
        const user = result.value?.[0];
        if (!user) {
          return {
            content: [{ type: "text", text: `No user found with extension '${extension}'.` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(user, null, 2) }],
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
    "create_user",
    "[DESTRUCTIVE] Creates a new 3CX user/extension. This will allocate a new extension number on the system.",
    {
      Number: z.string().describe("Extension number (e.g. '106'). Use list_users to find available numbers."),
      FirstName: z.string().describe("First name"),
      LastName: z.string().describe("Last name"),
      EmailAddress: z.string().describe("Email address"),
      Mobile: z.string().optional().describe("Mobile phone number"),
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = {
          Number: params.Number,
          FirstName: params.FirstName,
          LastName: params.LastName,
          EmailAddress: params.EmailAddress,
        };
        if (params.Mobile) body.Mobile = params.Mobile;
        const result = await xapi.post("/Users", body);
        return {
          content: [{
            type: "text",
            text: `User created successfully:\n${JSON.stringify(result, null, 2)}`,
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
    "update_user",
    "[DESTRUCTIVE] Updates an existing 3CX user. Only provided fields will be changed.",
    {
      id: z.number().describe("The numeric user ID (get it from list_users or get_user)"),
      FirstName: z.string().optional().describe("First name"),
      LastName: z.string().optional().describe("Last name"),
      EmailAddress: z.string().optional().describe("Email address"),
      Mobile: z.string().optional().describe("Mobile phone number"),
      Enabled: z.boolean().optional().describe("Enable or disable the user"),
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
        await xapi.patch(`/Users(${id})`, body);
        const updated = await xapi.get(`/Users(${id})`);
        return {
          content: [{
            type: "text",
            text: `User ${id} updated successfully:\n${JSON.stringify(updated, null, 2)}`,
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
    "delete_user",
    "[DESTRUCTIVE] Deletes one or more 3CX users by their numeric IDs. This action cannot be undone.",
    {
      ids: z.array(z.number()).describe("Array of user IDs to delete (e.g. [26, 27])"),
    },
    async ({ ids }) => {
      try {
        await xapi.post("/Users/Pbx.BatchDelete", { ids });
        return {
          content: [{
            type: "text",
            text: `Successfully deleted user(s) with ID(s): ${ids.join(", ")}`,
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
