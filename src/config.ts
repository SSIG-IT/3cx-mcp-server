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
});

export type Config = z.infer<typeof configSchema>;
export const config = configSchema.parse(process.env);
