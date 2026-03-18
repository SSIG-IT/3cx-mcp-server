import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";

export function registerSystemTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "get_system_status",
    "Retrieves the current 3CX system status (version, license, uptime)",
    {},
    async () => {
      try {
        const status = await xapi.get("/SystemStatus");
        return {
          content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
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
