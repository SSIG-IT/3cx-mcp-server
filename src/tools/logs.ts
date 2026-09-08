import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";
import { buildQuery } from "../lib/odata.js";
import { formatListResponse, toMcpText } from "../lib/response-formatter.js";

export function registerLogTools(server: McpServer, xapi: XapiClient) {
  server.registerTool(
    "get_event_logs",
    {
      title: "Get Event Logs",
      description:
        "Returns system event logs from 3CX. Each entry has: Id, Type (Info/Warning/Error), EventId, Message. Filter examples: \"Type eq 'Error'\" for errors only, \"Type eq 'Warning'\" for warnings. Use this for 'are there any errors on the phone system?' or 'show me recent system events' questions.",
      inputSchema: {
        filter: z.string().optional().describe("OData $filter, e.g. \"Type eq 'Error'\" or \"Type eq 'Warning'\""),
        top: z.number().optional().default(50).describe("Max results (default 50)"),
        skip: z.number().optional().describe("Skip N results for paging"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ filter, top, skip }) => {
      try {
        const query = buildQuery({ $filter: filter, $top: top, $skip: skip });
        const result = await xapi.get(`/EventLogs${query}`);
        return {
          content: [{ type: "text", text: toMcpText(formatListResponse(result, "event_log", { top, skip })) }],
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
