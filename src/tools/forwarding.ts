import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";
import { escapeODataString } from "../lib/odata.js";
import { formatListResponse, toMcpText } from "../lib/response-formatter.js";

export function registerForwardingTools(server: McpServer, xapi: XapiClient) {
  server.registerTool(
    "get_forwarding_profiles",
    {
      title: "Get Forwarding Profiles",
      description:
        "Use this when the user asks 'how are calls routed for extension 101?', 'what forwarding profiles does 200 have?', or 'show me the call routing for Philipp'. Returns the active profile name and all available profiles (Available, Away, Out of office, Custom 1, Custom 2) with their routing rules. Call this before set_forwarding_profile to see valid profile names.",
      inputSchema: {
        extension: z.string().describe("Extension number, e.g. '101'"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ extension }) => {
      try {
        const users = (await xapi.list("/Users", {
          filter: `Number eq '${escapeODataString(extension)}'`,
          select: "Id,Number,DisplayName,CurrentProfileName",
          top: 1,
        })) as { value?: Array<{ Id: number; CurrentProfileName?: string }> };
        const user = users.value?.[0];
        if (!user) {
          return {
            content: [{ type: "text", text: `No user found with extension '${extension}'.` }],
            isError: true,
          };
        }
        const profiles = await xapi.get(`/Users(${user.Id})/ForwardingProfiles`);
        const formatted = formatListResponse(profiles, "forwarding_profile");
        return {
          content: [
            {
              type: "text",
              text: `Current profile: ${user.CurrentProfileName}\n\n${toMcpText(formatted)}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "set_forwarding_profile",
    {
      title: "Set Forwarding Profile",
      description:
        "[DESTRUCTIVE] Use this when the user wants to change call routing: 'set extension 101 to Away', 'put Philipp on DND'. Changes take effect immediately. Valid profiles: 'Available', 'Away', 'Out of office', 'Custom 1', 'Custom 2'. Call get_forwarding_profiles first if you need to verify available profile names. Requires user confirmation.",
      inputSchema: {
        extension: z.string().describe("Extension number, e.g. '101'"),
        profile: z
          .string()
          .describe("Profile name exactly as shown in get_forwarding_profiles, e.g. 'Available', 'Away', 'Out of office'"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ extension, profile }) => {
      try {
        const users = (await xapi.list("/Users", {
          filter: `Number eq '${escapeODataString(extension)}'`,
          select: "Id,Number,DisplayName,CurrentProfileName",
          top: 1,
        })) as { value?: Array<{ Id: number; DisplayName: string; CurrentProfileName: string }> };
        const user = users.value?.[0];
        if (!user) {
          return {
            content: [{ type: "text", text: `No user found with extension '${extension}'.` }],
            isError: true,
          };
        }
        const previousProfile = user.CurrentProfileName;
        await xapi.patch(`/Users(${user.Id})`, { CurrentProfileName: profile });
        return {
          content: [
            {
              type: "text",
              text: `Forwarding profile for ${user.DisplayName} (${extension}) changed: '${previousProfile}' → '${profile}'`,
            },
          ],
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
