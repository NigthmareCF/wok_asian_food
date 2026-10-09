import { vi } from "vitest";
import { clientIdentityStore } from "@/modules/clients/client-identity-store";
export const staffFixtureId = "40000000-0000-4000-8000-000000000001";
// Solo pruebas: identidad separada del mock de transporte de dominio.
export function installPrivateSession(
  resource: typeof fetch,
  owner = () => staffFixtureId,
) {
  clientIdentityStore.invalidate();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/bff/auth/session") {
        return Promise.resolve(Response.json({ user: { userId: owner() } }));
      }
      return resource(input, init);
    }),
  );
}
