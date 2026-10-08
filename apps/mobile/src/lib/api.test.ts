import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("apiRequest error messages", () => {
  let apiRequest: typeof import("./api").apiRequest;

  beforeEach(async () => {
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://api.wok.test");
    vi.resetModules();
    ({ apiRequest } = await import("./api"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("shows safe backend validation messages for client errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: "Completa las opciones requeridas de Base." }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    )));

    const request = apiRequest("/api/v1/client/order-requests", { method: "POST" });
    await expect(request).rejects.toThrow("Completa las opciones requeridas de Base.");
    await expect(request).rejects.toMatchObject({ status: 422 });
  });

  it("uses the standard message when an error response is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("internal text", {
      status: 422, headers: { "Content-Type": "text/plain" },
    })));

    const request = apiRequest("/api/v1/client/order-requests");
    await expect(request).rejects.toThrow("El restaurante no puede aceptar esta solicitud en ese horario.");
    await expect(request).rejects.toMatchObject({ status: 422 });
  });

  it("does not expose unexpected server error details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: "database password: secret" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )));

    const request = apiRequest("/api/v1/client/order-requests");
    await expect(request).rejects.toThrow("No se pudo completar la solicitud (500).");
    await expect(request).rejects.toMatchObject({ status: 500 });
  });

  it("keeps authentication errors neutral", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: "Untrusted account detail" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )));

    const request = apiRequest("/api/v1/auth/login");
    await expect(request).rejects.toThrow("La sesión no es válida. Inicia sesión nuevamente.");
    await expect(request).rejects.toMatchObject({ status: 401 });
  });

  it("lets the browser set the multipart boundary when uploading evidence", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "evidence-1" }), {
      status: 201, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.append("file", new Blob(["image-bytes"], { type: "image/png" }), "receipt.png");

    await expect(apiRequest("/api/v1/client/order-requests/order-1/payment-evidence", {
      method: "POST", headers: { "Idempotency-Key": "attempt-1" }, body: form,
    }, "access-token")).resolves.toEqual({ id: "evidence-1" });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = request.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(headers.Authorization).toBe("Bearer access-token");
    expect(headers["Idempotency-Key"]).toBe("attempt-1");
  });
});
