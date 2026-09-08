import type { Config } from "../config.js";
import type { TokenManager } from "../auth/token-manager.js";
import { logger } from "../lib/logger.js";
import { buildQuery } from "../lib/odata.js";

function buildBaseUrl(config: Config): string {
  const port = config.TCX_PORT;
  const portSuffix = port === "443" ? "" : `:${port}`;
  return `https://${config.TCX_FQDN}${portSuffix}/xapi/v1`;
}

export interface ListOptions {
  filter?: string;
  top?: number;
  skip?: number;
  orderby?: string;
  select?: string;
  count?: boolean;
}

export interface ListResult<T = Record<string, unknown>> {
  value: T[];
  count?: number;
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

  /** OData list helper with optional $count. Returns { value, count }. */
  async list<T = Record<string, unknown>>(
    entity: string,
    opts: ListOptions = {},
  ): Promise<ListResult<T>> {
    const query = buildQuery({
      $filter: opts.filter,
      $top: opts.top,
      $skip: opts.skip,
      $orderby: opts.orderby,
      $select: opts.select,
      $count: opts.count ? "true" : undefined,
    });
    const data = (await this.get(`${entity}${query}`)) as Record<string, unknown>;
    const count = data?.["@odata.count"];
    return {
      value: (data?.value as T[]) ?? [],
      count: typeof count === "number" ? count : undefined,
    };
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    isRetry = false,
  ): Promise<unknown> {
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
      logger.error(`request failed ${method} ${path}`, err instanceof Error ? err.message : err);
      throw new Error(
        `Connection to 3CX failed (${this.fqdn}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (res.status === 401) {
      // Token may have been revoked/expired server-side before our cached expiry.
      this.tokenManager.invalidate();
      if (!isRetry) {
        logger.warn(`401 on ${method} ${path} — refreshing token and retrying once`);
        return this.request(method, path, body, true);
      }
      throw new Error(
        "Token expired or invalid credentials — re-check TCX_CLIENT_ID and TCX_CLIENT_SECRET",
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`XAPI ${method} ${path} failed: ${res.status} ${res.statusText} — ${text}`);
    }

    if (res.status === 204) return null;

    return res.json();
  }
}
