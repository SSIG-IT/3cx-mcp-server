import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";

export function registerTrunkTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "list_trunks",
    "Lists all configured SIP trunks on the 3CX system.",
    {},
    async () => {
      try {
        const result = await xapi.get("/Trunks");
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
    "get_trunk_details",
    "Retrieves detailed information about a specific SIP trunk by its ID.",
    {
      id: z.number().describe("The trunk ID (get it from list_trunks)"),
    },
    async ({ id }) => {
      try {
        const result = await xapi.get(`/Trunks(${id})`);
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
}
