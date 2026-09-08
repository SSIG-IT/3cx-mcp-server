/**
 * Minimal stderr logger honoring MCP_LOG_LEVEL.
 *
 * IMPORTANT: logs go to stderr only. stdout is the MCP stdio JSON-RPC channel
 * and must never be polluted.
 */
import type { Config } from "../config.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

let threshold: number = LEVELS.info;

export function configureLogger(config: Pick<Config, "MCP_LOG_LEVEL">): void {
  threshold = LEVELS[config.MCP_LOG_LEVEL] ?? LEVELS.info;
}

function log(level: Level, message: string, meta?: unknown): void {
  if (LEVELS[level] < threshold) return;
  const line = `[3cx-mcp] ${level.toUpperCase()} ${message}`;
  if (meta !== undefined) console.error(line, meta);
  else console.error(line);
}

export const logger = {
  debug: (message: string, meta?: unknown) => log("debug", message, meta),
  info: (message: string, meta?: unknown) => log("info", message, meta),
  warn: (message: string, meta?: unknown) => log("warn", message, meta),
  error: (message: string, meta?: unknown) => log("error", message, meta),
};
