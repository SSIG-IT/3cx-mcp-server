#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config.js";
import { TokenManager } from "./auth/token-manager.js";
import { XapiClient } from "./api/xapi-client.js";
import { registerSystemTools } from "./tools/system.js";
import { registerUserTools } from "./tools/users.js";
import { registerDepartmentTools } from "./tools/departments.js";
import { registerTrunkTools } from "./tools/trunks.js";
import { registerCallTools } from "./tools/calls.js";
import { registerQueueTools } from "./tools/queues.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerExtensionTools } from "./tools/extensions.js";
import { registerLogTools } from "./tools/logs.js";

const server = new McpServer({
  name: "3cx-mcp-server",
  version: "0.1.0",
});

const tokenManager = new TokenManager(config);
const xapi = new XapiClient(config, tokenManager);

// Register all tools
registerSystemTools(server, xapi);
registerUserTools(server, xapi);
registerDepartmentTools(server, xapi);
registerTrunkTools(server, xapi);
registerCallTools(server, xapi);
registerQueueTools(server, xapi);
registerContactTools(server, xapi);
registerExtensionTools(server, xapi);
registerLogTools(server, xapi);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("3CX MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
