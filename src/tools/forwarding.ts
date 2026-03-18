import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";

export function registerForwardingTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "get_forwarding_profiles",
    "Retrieves the forwarding profiles of a 3CX user by extension number, including routing rules for each profile.",
    {
      extension: z.string().describe("The extension number (e.g. '101')"),
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
    "[DESTRUCTIVE] Sets the active forwarding profile for a 3CX extension. Changes call routing immediately.",
    {
      extension: z.string().describe("The extension number (e.g. '101')"),
      profile: z.string().describe("Profile name: 'Available', 'Away', 'Out of office', 'Custom 1', etc."),
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
