import type { Config } from "../config.js";
import { logger } from "../lib/logger.js";

export class TokenManager {
  private token: string | null = null;
  private expiresAt = 0;
  private refreshing: Promise<string> | null = null;

  constructor(private config: Config) {}

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt - 60_000) {
      return this.token;
    }
    // Deduplicate concurrent refreshes: parallel tool calls share one request.
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.refreshToken().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** Drop the cached token so the next getToken() re-authenticates (e.g. after a 401). */
  invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  private async refreshToken(): Promise<string> {
    const port = this.config.TCX_PORT;
    const portSuffix = port === "443" ? "" : `:${port}`;
    const url = `https://${this.config.TCX_FQDN}${portSuffix}/connect/token`;
    const body = new URLSearchParams({
      client_id: this.config.TCX_CLIENT_ID,
      client_secret: this.config.TCX_CLIENT_SECRET,
      grant_type: "client_credentials",
    });

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (err) {
      logger.error("token request failed", err instanceof Error ? err.message : err);
      throw new Error(
        `Connection to 3CX failed (${this.config.TCX_FQDN}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!res.ok) {
      logger.error(`token auth failed: ${res.status} ${res.statusText}`);
      throw new Error(`3CX auth failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.token = data.access_token;
    this.expiresAt = Date.now() + data.expires_in * 1000;
    logger.debug("token refreshed");
    return this.token;
  }
}
