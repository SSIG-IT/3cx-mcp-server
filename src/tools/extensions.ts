import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";

export function registerExtensionTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "get_extension_status",
    "Use this when the user asks 'is extension 101 online?', 'what status has extension 200?', or 'is Philipp available?'. Returns: Number, DisplayName, IsRegistered (true=phone connected), CurrentProfileName (Available/Away/Out of office), QueueStatus (LoggedIn/LoggedOut). For full user details use get_user, for searching by name use find_users.",
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
