#!/usr/bin/env node

import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config, type Config } from "./config.js";
import { TokenManager } from "./auth/token-manager.js";
import { XapiClient } from "./api/xapi-client.js";
import { configureLogger, logger } from "./lib/logger.js";
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

function createMcpServer(xapi: XapiClient, cfg: Config): McpServer {
  const server = new McpServer(
    { name: "3cx-mcp-server", version: "0.3.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  registerSystemTools(server, xapi);
  registerUserTools(server, xapi);
  registerDepartmentTools(server, xapi);
  registerTrunkTools(server, xapi);
  registerCallTools(server, xapi, cfg);
  registerQueueTools(server, xapi);
  registerContactTools(server, xapi);
  registerExtensionTools(server, xapi);
  registerLogTools(server, xapi);
  registerForwardingTools(server, xapi);

  return server;
}

async function startStdio(xapi: XapiClient, cfg: Config) {
  const server = createMcpServer(xapi, cfg);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("3CX MCP Server started (stdio)");
}

function buildAllowedHosts(cfg: Config): string[] {
  const port = cfg.MCP_HTTP_PORT;
  const hosts = new Set<string>([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
    `${cfg.MCP_HTTP_HOST}:${port}`,
  ]);
  if (cfg.MCP_ALLOWED_HOSTS) {
    for (const host of cfg.MCP_ALLOWED_HOSTS.split(",")) {
      const trimmed = host.trim();
      if (trimmed) hosts.add(trimmed);
    }
  }
  return [...hosts];
}

async function startHttp(xapi: XapiClient, cfg: Config) {
  const port = Number(cfg.MCP_HTTP_PORT);
  const host = cfg.MCP_HTTP_HOST;
  const allowedHosts = buildAllowedHosts(cfg);

  const httpServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", transport: "http", timestamp: new Date().toISOString() }));
      return;
    }

    if (url.pathname === "/mcp") {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }));
        return;
      }

      // Fresh MCP server + transport per request (stateless), but the shared
      // XapiClient/TokenManager keeps the 3CX token cached across requests.
      // DNS-rebinding protection guards against browser-based attacks; auth is
      // expected to be terminated by a fronting proxy (e.g. mcphub OAuth).
      const server = createMcpServer(xapi, cfg);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableDnsRebindingProtection: true,
        allowedHosts,
      });

      res.on("close", () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
      });

      server
        .connect(transport)
        .then(() => transport.handleRequest(req, res))
        .catch((err) => {
          logger.error("http request handling failed", err instanceof Error ? err.message : err);
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
    logger.info(`3CX MCP Server listening on http://${host}:${port}/mcp`);
    logger.info(`Health check: http://${host}:${port}/health`);
    logger.info(`Allowed hosts (DNS-rebinding protection): ${allowedHosts.join(", ")}`);
  });
}

async function main() {
  configureLogger(config);
  const tokenManager = new TokenManager(config);
  const xapi = new XapiClient(config, tokenManager);

  if (config.MCP_TRANSPORT === "http") {
    await startHttp(xapi, config);
  } else {
    await startStdio(xapi, config);
  }
}

main().catch((err) => {
  logger.error("Fatal error", err instanceof Error ? err.message : err);
  process.exit(1);
});
