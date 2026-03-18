import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";

export function registerExtensionTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "get_extension_status",
    "Quick status check for a 3CX extension. Returns: Number, DisplayName, IsRegistered (true=phone connected), CurrentProfileName (Available/Away/Out of office/DND), QueueStatus (LoggedIn/LoggedOut). Use this when the user asks 'is extension X online?' or 'what's the status of extension X?'. For full user details, use get_user instead.",
    {
      extension: z.string().describe("Extension number, e.g. '101'"),
    },
    async ({ extension }) => {
      try {
        const result = await xapi.get(
          `/Users?$filter=Number eq '${extension}'&$select=Number,DisplayName,IsRegistered,CurrentProfileName,QueueStatus`,
        ) as { value?: unknown[] };
        const user = result.value?.[0];
        if (!user) {
          return {
            content: [{ type: "text", text: `No extension '${extension}' found.` }],
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
}
