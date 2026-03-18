import type { Config } from "../config.js";
import type { TokenManager } from "../auth/token-manager.js";

function buildBaseUrl(config: Config): string {
  const port = config.TCX_PORT;
  const portSuffix = port === "443" ? "" : `:${port}`;
  return `https://${config.TCX_FQDN}${portSuffix}/xapi/v1`;
}

export class XapiClient {
  private baseUrl: string;
  private fqdn: string;

  constructor(
    config: Config,
    private tokenManager: TokenManager,
  ) {
    this.baseUrl = buildBaseUrl(config);
    this.fqdn = config.TCX_FQDN;
  }

  async get(path: string): Promise<unknown> {
    return this.request("GET", path);
  }

  async post(path: string, body?: unknown): Promise<unknown> {
    return this.request("POST", path, body);
  }

  async patch(path: string, body: unknown): Promise<unknown> {
    return this.request("PATCH", path, body);
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const token = await this.tokenManager.getToken();
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };

    const init: RequestInit = { method, headers };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new Error(
        `Connection to 3CX failed (${this.fqdn}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (res.status === 401) {
      throw new Error("Token expired or invalid credentials — re-check TCX_CLIENT_ID and TCX_CLIENT_SECRET");
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`XAPI ${method} ${path} failed: ${res.status} ${res.statusText} — ${text}`);
    }

    if (res.status === 204) return null;

    return res.json();
  }
}
