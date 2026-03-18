import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";

export function registerForwardingTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "get_forwarding_profiles",
    "Returns all forwarding profiles for a 3CX extension with their routing rules. Shows the currently active profile and all available profiles (typically: Available, Away, Out of office, Custom 1, Custom 2). Each profile contains routing rules for internal/external calls during office hours and outside. Use this to see how calls are routed for a specific extension.",
    {
      extension: z.string().describe("Extension number, e.g. '101'"),
    },
    async ({ extension }) => {
      try {
        const users = await xapi.get(`/Users?$filter=Number eq '${extension}'&$select=Id,Number,DisplayName,CurrentProfileName`) as { value?: Array<{ Id: number }> };
        const user = users.value?.[0];
        if (!user) {
          return {
            content: [{ type: "text", text: `No user found with extension '${extension}'.` }],
            isError: true,
          };
        }
        const profiles = await xapi.get(`/Users(${user.Id})/ForwardingProfiles`);
        return {
          content: [{
            type: "text",
            text: `Current profile: ${(user as Record<string, unknown>).CurrentProfileName}\n\n${JSON.stringify(profiles, null, 2)}`,
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
    "set_forwarding_profile",
    "[DESTRUCTIVE] Changes the active forwarding profile for a 3CX extension. Takes effect immediately — calls will be routed according to the new profile. Standard profiles: 'Available', 'Away', 'Out of office', 'Custom 1', 'Custom 2'. Use get_forwarding_profiles first to see which profiles exist for the extension.",
    {
      extension: z.string().describe("Extension number, e.g. '101'"),
      profile: z.string().describe("Profile name exactly as shown in get_forwarding_profiles, e.g. 'Available', 'Away', 'Out of office'"),
    },
    async ({ extension, profile }) => {
      try {
        const users = await xapi.get(`/Users?$filter=Number eq '${extension}'&$select=Id,Number,DisplayName,CurrentProfileName`) as { value?: Array<{ Id: number; DisplayName: string; CurrentProfileName: string }> };
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
          content: [{
            type: "text",
            text: `Forwarding profile for ${user.DisplayName} (${extension}) changed: '${previousProfile}' → '${profile}'`,
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
