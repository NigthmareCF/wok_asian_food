"use client";
import { useEffect, useState } from "react";
import {
  clientIdentityStore,
  createClientOperation,
} from "@/modules/clients/client-identity-store";
import { useClientIdentity } from "@/modules/clients/use-client-identity";
import { useAutomaticRefresh } from "@/modules/client-workflows/use-automatic-refresh";

export function useClientPickupResource<T>(
  url: string,
  validate: (value: unknown) => value is T,
  userId?: string,
  refreshMilliseconds = 10_000,
) {
  const { identity, verified, refresh } = useClientIdentity(userId);
  const [revision, setRevision] = useState(0);
  useAutomaticRefresh(
    () => setRevision((value) => value + 1),
    refreshMilliseconds,
    verified,
  );
  const [result, setResult] = useState<{
    generation: number;
    url: string;
    revision: number;
    data: T | null;
    error: { message: string; status: number } | null;
  } | null>(null);
  useEffect(() => {
    if (!verified) return;
    const operation = createClientOperation(identity);
    const publish = (
      data: T | null,
      error: { message: string; status: number } | null,
    ) => {
      if (operation.valid())
        setResult({
          generation: identity.generation,
          url,
          revision,
          data,
          error,
        });
    };
    async function load() {
      try {
        if (!(await operation.confirm()) || !operation.valid()) return;
        const response = await fetch(url, {
          cache: "no-store",
          headers: { "X-Wok-Expected-Principal": identity.ownerId! },
          signal: operation.signal,
        });
        if (!operation.valid()) return;
        const body: unknown = await response.json();
        if (!operation.valid()) return;
        if (response.status === 401) {
          clientIdentityStore.invalidate();
          return;
        }
        if (
          body &&
          typeof body === "object" &&
          "code" in body &&
          ((response.status === 409 &&
            body.code === "CLIENT_PRINCIPAL_CHANGED") ||
            (response.status === 503 &&
              body.code === "CLIENT_PRINCIPAL_UNVERIFIED"))
        ) {
          clientIdentityStore.invalidate();
          return;
        }
        if (!(await operation.confirm()) || !operation.valid()) return;
        if (!response.ok) {
          const message =
            body &&
            typeof body === "object" &&
            "message" in body &&
            typeof body.message === "string"
              ? body.message
              : "No pudimos consultar la solicitud.";
          publish(null, { message, status: response.status });
        } else if (validate(body)) publish(body, null);
        else throw new Error("Invalid pickup response");
      } catch {
        if (await operation.confirm())
          publish(null, {
            message:
              "No pudimos consultar tus solicitudes. Intenta nuevamente.",
            status: 503,
          });
      }
    }
    void load();
    return () => operation.dispose();
  }, [identity, verified, url, validate, revision]);
  const current =
    verified && result?.generation === identity.generation && result.url === url
      ? result
      : null;
  return {
    data: current?.data ?? null,
    error:
      current?.error ??
      (!verified && identity.status !== "unverified"
        ? {
            message: "Verifica tu sesión para consultar tus solicitudes.",
            status: 401,
          }
        : null),
    reload: () => {
      if (verified) setRevision((value) => value + 1);
      else void refresh();
    },
  };
}
