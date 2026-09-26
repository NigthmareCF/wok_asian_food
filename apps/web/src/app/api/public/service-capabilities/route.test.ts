import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("public service capability BFF", () => {
  it("returns unavailable without exposing environment or upstream details", async () => {
    vi.stubEnv("WOK_API_BASE_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      message: "El estado de los servicios no está disponible.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches live statuses without caching and returns only allowlisted fields", async () => {
    vi.stubEnv("WOK_API_BASE_URL", "http://wok-api.test/");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json([
        { code: "RESERVATIONS", status: "MANUAL_APPROVAL", reason: "internal" },
        { code: "PICKUP", status: "ENABLED", reason: "internal" },
        { code: "CUSTOMERS", status: "ENABLED" },
        { code: "DELIVERY", status: "UNKNOWN" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual([
      { code: "RESERVATIONS", status: "MANUAL_APPROVAL" },
      { code: "PICKUP", status: "ENABLED" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://wok-api.test/api/v1/public/service-capabilities",
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
  });
});
