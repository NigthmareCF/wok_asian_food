// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("public menu BFF", () => {
  it("reads the configured API without caching or forwarding credentials", async () => {
    vi.stubEnv("WOK_API_BASE_URL", "http://api:8080/");
    const data = { categories: [], asOf: "2026-10-02T12:00:00Z" };
    const fetcher = vi.fn().mockResolvedValue(Response.json(data));
    vi.stubGlobal("fetch", fetcher);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(data);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetcher).toHaveBeenCalledWith(
      "http://api:8080/api/v1/public/menu",
      expect.objectContaining({
        cache: "no-store",
        headers: { Accept: "application/json" },
      }),
    );
  });

  it.each([
    new Response("private backend error", { status: 500 }),
    Response.json({ categories: "invalid" }),
  ])(
    "returns a neutral error for an unavailable or malformed API",
    async (upstream) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream));
      const response = await GET();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        message: "No fue posible cargar el menú. Intenta nuevamente.",
      });
    },
  );

  it("handles network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect((await GET()).status).toBe(503);
  });
});
