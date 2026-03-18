import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";

export function registerCallTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "get_active_calls",
    "Retrieves currently active calls on the 3CX system.",
    {},
    async () => {
      try {
        const result = await xapi.get("/ActiveCalls");
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

  // TODO: get_call_logs via /CallHistoryView — returns 403 with current service principal.
  // The endpoint exists in the swagger but requires elevated permissions.
  // Re-enable once the API key has the necessary role/permissions configured in 3CX Admin.
}
