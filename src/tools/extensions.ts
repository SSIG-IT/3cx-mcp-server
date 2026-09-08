import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";
import { escapeODataString } from "../lib/odata.js";

export function registerExtensionTools(server: McpServer, xapi: XapiClient) {
  server.registerTool(
    "get_extension_status",
    {
      title: "Get Extension Status",
      description:
        "Use this when the user asks 'is extension 101 online?', 'what status has extension 200?', or 'is Philipp available?'. Returns: Number, DisplayName, IsRegistered (true=phone connected), CurrentProfileName (Available/Away/Out of office), QueueStatus (LoggedIn/LoggedOut). For full user details use get_user, for searching by name use find_users.",
      inputSchema: {
        extension: z.string().describe("Extension number, e.g. '101'"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ extension }) => {
      try {
        const result = await xapi.list("/Users", {
          filter: `Number eq '${escapeODataString(extension)}'`,
          select: "Number,DisplayName,IsRegistered,CurrentProfileName,QueueStatus",
          top: 1,
        });
        const user = result.value[0];
        if (!user) {
          return {
            content: [{ type: "text", text: `No extension '${extension}' found.` }],
            isError: true,
          };
        }
        return { content: [{ type: "text", text: JSON.stringify(user, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
