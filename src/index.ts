#!/usr/bin/env node

import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";
import { TokenManager } from "./auth/token-manager.js";
import { XapiClient } from "./api/xapi-client.js";
import { SERVER_INSTRUCTIONS } from "./lib/instructions.js";
import { registerSystemTools } from "./tools/system.js";
import { registerUserTools } from "./tools/users.js";
import { registerDepartmentTools } from "./tools/departments.js";
import { registerTrunkTools } from "./tools/trunks.js";
import { registerCallTools } from "./tools/calls.js";
import { registerQueueTools } from "./tools/queues.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerExtensionTools } from "./tools/extensions.js";
import { registerLogTools } from "./tools/logs.js";
import { registerForwardingTools } from "./tools/forwarding.js";

function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "3cx-mcp-server", version: "0.2.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  const tokenManager = new TokenManager(config);
  const xapi = new XapiClient(config, tokenManager);

  registerSystemTools(server, xapi);
  registerUserTools(server, xapi);
  registerDepartmentTools(server, xapi);
  registerTrunkTools(server, xapi);
  registerCallTools(server, xapi, config);
  registerQueueTools(server, xapi);
  registerContactTools(server, xapi);
  registerExtensionTools(server, xapi);
  registerLogTools(server, xapi);
  registerForwardingTools(server, xapi);

  return server;
}

async function startStdio() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function startHttp() {
  const port = Number(process.env.MCP_HTTP_PORT ?? "8080");
  const host = process.env.MCP_HTTP_HOST ?? "0.0.0.0";

  const httpServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    // Health endpoint
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", transport: "http", timestamp: new Date().toISOString() }));
      return;
    }

    // MCP endpoint — stateless: fresh server + transport per request
    if (url.pathname === "/mcp") {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }));
        return;
      }

      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

      res.on("close", () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
      });

      server.connect(transport).then(() => {
        transport.handleRequest(req, res);
      }).catch((err) => {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: String(err) }, id: null }));
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found", endpoints: ["/mcp", "/health"] }));
  });

  httpServer.listen(port, host, () => {
    console.error(`3CX MCP Server listening on http://${host}:${port}/mcp`);
    console.error(`Health check: http://${host}:${port}/health`);
  });
}

async function main() {
  if (config.MCP_TRANSPORT === "http") {
    await startHttp();
  } else {
    await startStdio();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
