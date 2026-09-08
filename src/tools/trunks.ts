import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";
import { formatListResponse, toMcpText } from "../lib/response-formatter.js";

export function registerTrunkTools(server: McpServer, xapi: XapiClient) {
  server.registerTool(
    "list_trunks",
    {
      title: "List Trunks",
      description:
        "Returns all SIP trunks configured on the 3CX system (compact). Each trunk has: Id, Number, Name, IsOnline (registration status), Direction, SimultaneousCalls. Use get_trunk_details with the Id for the full configuration.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const result = await xapi.get("/Trunks");
        return {
          content: [{ type: "text", text: toMcpText(formatListResponse(result, "trunk")) }],
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
    "get_trunk_details",
    {
      title: "Get Trunk Details",
      description:
        "Returns the FULL configuration of a specific SIP trunk including registration details, codecs, routes, and authentication. Get the trunk Id from list_trunks first.",
      inputSchema: {
        id: z.number().describe("Trunk Id from list_trunks"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      try {
        // Return the raw, full trunk object — the compact formatter is intentionally
        // NOT applied here, since callers ask for complete configuration.
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
