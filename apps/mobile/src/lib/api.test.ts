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
});
