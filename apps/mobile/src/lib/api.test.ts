import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("apiRequest error messages", () => {
  let apiRequest: typeof import("./api").apiRequest;
  let requestTimeoutMs: typeof import("./api").API_REQUEST_TIMEOUT_MS;

  beforeEach(async () => {
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://api.wok.test");
    vi.resetModules();
    ({ apiRequest, API_REQUEST_TIMEOUT_MS: requestTimeoutMs } = await import("./api"));
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("does not claim a mutation was not sent when the network response is uncertain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("connection closed")));

    await expect(apiRequest("/api/v1/client/order-requests", {
      method: "POST", body: JSON.stringify({ items: [{ menuItemId: "item-1", quantity: 1 }] }),
    })).rejects.toThrow("No pudimos confirmar la respuesta de WOK. Si estabas enviando una solicitud, revisa su estado antes de volver a intentarlo.");
  });

  it("aborts a request after the bounded timeout and keeps the result uncertain", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = apiRequest("/api/v1/client/order-requests", { method: "POST", body: "{}" });
    const rejected = expect(pending).rejects.toThrow("No pudimos confirmar la respuesta de WOK.");
    const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal;
    await vi.advanceTimersByTimeAsync(requestTimeoutMs);

    await rejected;
    expect(signal?.aborted).toBe(true);
    vi.useRealTimers();
  });

  it("keeps the timeout active while reading a response body", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => Promise.resolve({
      ok: true,
      status: 200,
      json: () => new Promise((_resolve, reject) => {
        const signal = init?.signal;
        const rejectAsAborted = () => reject(new DOMException("Aborted", "AbortError"));
        if (signal?.aborted) rejectAsAborted();
        else signal?.addEventListener("abort", rejectAsAborted, { once: true });
      }),
    } as Response));
    vi.stubGlobal("fetch", fetchMock);

    const pending = apiRequest("/api/v1/public/menu");
    const rejected = expect(pending).rejects.toThrow("No pudimos confirmar la respuesta de WOK.");
    await vi.advanceTimersByTimeAsync(requestTimeoutMs);

    await rejected;
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true);
  });

  it("forwards an explicit caller cancellation to fetch", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = apiRequest("/api/v1/client/profile", { signal: controller.signal });
    const rejected = expect(pending).rejects.toThrow("No pudimos confirmar la respuesta de WOK.");
    controller.abort();

    await rejected;
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true);
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
