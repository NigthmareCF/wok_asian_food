"use client";
import { useClientPickupResource } from "./use-client-pickup-resource";
// Lecturas privadas: identidad, generaci?n y principal esperado compartidos.
export function usePickupResource<T>(
  url: string,
  validate: (value: unknown) => value is T,
  refreshMilliseconds = 0,
  userId?: string,
) {
  return useClientPickupResource(url, validate, userId, refreshMilliseconds);
}
