import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";

export function registerSystemTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "get_system_status",
    "Returns 3CX system overview. Fields: FQDN, Version, Activated, MaxSimCalls, ExtensionsRegistered, ExtensionsTotal, TrunksRegistered, TrunksTotal, CallsActive, LicenseActive, ExpirationDate, MaintenanceExpiresAt, Support, ProductCode, BackupScheduled, LastBackupDateTime, DiskUsage, FreeDiskSpace, OS. Use this to check system health, license status, or how many active calls are running.",
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
