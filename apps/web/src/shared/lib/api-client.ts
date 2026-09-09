export type ApiError = { code: string; message: string; status: number };

export interface ApiClient {
  get<Response>(path: string, signal?: AbortSignal): Promise<Response>;
  post<Response, Body>(
    path: string,
    body: Body,
    signal?: AbortSignal,
  ): Promise<Response>;
}

export class HttpApiClient implements ApiClient {
  constructor(private readonly baseUrl: string) {}

  async get<Response>(path: string, signal?: AbortSignal) {
    return this.request<Response>(path, { method: "GET", signal });
  }

  async post<Response, Body>(path: string, body: Body, signal?: AbortSignal) {
    return this.request<Response>(path, {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    });
  }

  private async request<Response>(
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
    if (!response.ok)
      throw {
        code: "HTTP_ERROR",
        message: "No se pudo completar la solicitud.",
        status: response.status,
      } satisfies ApiError;
    return response.json() as Promise<Response>;
  }
}
