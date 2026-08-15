// ABOUTME: Tests the shared AppFolio HTTP client — auth headers, retry, error handling.
// ABOUTME: Verifies Basic auth, developer ID header, retry logic, and error throwing.
import { describe, it, expect, vi } from "vitest";
import { AppFolioHttpClient, AppFolioHttpError } from "./http";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AppFolioHttpClient", () => {
  it("sends Basic auth and developer ID headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = new AppFolioHttpClient({
      baseUrl: "https://api.appfolio.com/api/v0",
      username: "client-id",
      password: "client-secret",
      developerId: "dev-123",
      fetchImpl,
    });

    await client.request("GET", "/tenants");

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.appfolio.com/api/v0/tenants");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("client-id:client-secret").toString("base64")}`);
    expect(headers["X-AppFolio-Developer-ID"]).toBe("dev-123");
  });

  it("appends query params", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = new AppFolioHttpClient({
      baseUrl: "https://api.appfolio.com/api/v0",
      username: "u",
      password: "p",
      fetchImpl,
    });

    await client.request("GET", "/tenants", { query: { page: "2" } });

    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.appfolio.com/api/v0/tenants?page=2");
  });

  it("retries on 429 then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new AppFolioHttpClient({
      baseUrl: "https://api.appfolio.com/api/v0",
      username: "u",
      password: "p",
      fetchImpl,
      retryDelayMs: 1,
    });

    const result = await client.request("GET", "/tenants");

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws AppFolioHttpError after exhausting retries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("server error", { status: 500 }));
    const client = new AppFolioHttpClient({
      baseUrl: "https://api.appfolio.com/api/v0",
      username: "u",
      password: "p",
      fetchImpl,
      retryDelayMs: 1,
      maxRetries: 2,
    });

    await expect(client.request("GET", "/tenants")).rejects.toThrow(AppFolioHttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("does not retry on 4xx other than 429", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
    const client = new AppFolioHttpClient({
      baseUrl: "https://api.appfolio.com/api/v0",
      username: "u",
      password: "p",
      fetchImpl,
    });

    await expect(client.request("GET", "/tenants/999")).rejects.toThrow(AppFolioHttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
