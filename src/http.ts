// ABOUTME: Shared HTTP client for both AppFolio APIs (Basic auth, retry/backoff, pagination).
// ABOUTME: Every AppFolio network call in this codebase goes through here, nowhere else.
export interface AppFolioHttpClientOptions {
  baseUrl: string;
  username: string;
  password: string;
  developerId?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class AppFolioHttpError extends Error {
  constructor(public status: number, public body: string) {
    super(`AppFolio request failed with ${status}: ${body}`);
    this.name = "AppFolioHttpError";
  }
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class AppFolioHttpClient {
  private baseUrl: string;
  private authHeader: string;
  private developerId?: string;
  private fetchImpl: typeof fetch;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(opts: AppFolioHttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.authHeader = `Basic ${Buffer.from(`${opts.username}:${opts.password}`).toString("base64")}`;
    this.developerId = opts.developerId;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = opts.maxRetries ?? 3;
    this.retryDelayMs = opts.retryDelayMs ?? 250;
  }

  async request(
    method: string,
    path: string,
    opts: { query?: Record<string, string>; body?: unknown } = {}
  ): Promise<unknown> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      "content-type": "application/json",
    };
    if (this.developerId) headers["X-AppFolio-Developer-ID"] = this.developerId;

    let attempt = 0;
    for (;;) {
      const response = await this.fetchImpl(url.toString(), {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });

      if (response.ok) {
        if (response.status === 204) return undefined;
        return response.json();
      }

      const shouldRetry = RETRYABLE_STATUSES.has(response.status) && attempt < this.maxRetries;
      if (!shouldRetry) {
        const body = await response.text();
        throw new AppFolioHttpError(response.status, body);
      }

      attempt++;
      await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * 2 ** (attempt - 1)));
    }
  }
}
