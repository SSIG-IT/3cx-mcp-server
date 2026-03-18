import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";

export function registerTrunkTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "list_trunks",
    "Returns all SIP trunks configured on the 3CX system. Each trunk has: Id, Number, Name, IsOnline (registration status), Direction, SimultaneousCalls. Use get_trunk_details with the Id for full configuration details.",
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
    "Returns full configuration of a specific SIP trunk including registration details, codecs, routes, and authentication. Get the trunk Id from list_trunks first.",
    {
      id: z.number().describe("Trunk Id from list_trunks"),
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
