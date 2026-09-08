import { z } from "zod";

export const configSchema = z.object({
  TCX_FQDN: z.string().min(1),
  TCX_PORT: z.string().default("443"),
  TCX_TIMEZONE: z.string().optional(),
  TCX_CLIENT_ID: z.string().min(1),
  TCX_CLIENT_SECRET: z.string().min(1),
  TCX_WEBAPI_KEY: z.string().optional(),
  TCX_CALLCONTROL_ENABLED: z.string().default("false"),
  MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
  MCP_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  // HTTP transport (only used when MCP_TRANSPORT=http). Binds to loopback by
  // default — the server relies on a fronting proxy (e.g. mcphub) for OAuth.
  MCP_HTTP_PORT: z.string().default("8080"),
  MCP_HTTP_HOST: z.string().default("127.0.0.1"),
  // Comma-separated Host allow-list for DNS-rebinding protection. Loopback hosts
  // are always allowed; set this when a proxy forwards a different Host header.
  MCP_ALLOWED_HOSTS: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;
export const config = configSchema.parse(process.env);
