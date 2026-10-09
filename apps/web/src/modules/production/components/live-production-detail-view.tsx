"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductionDetails } from "../live-contract";
export function LiveProductionDetailView({ batchId }: { batchId: string }) {
  const [data, setData] = useState<ProductionDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/bff/operational/production/${batchId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            (
              (await response.json().catch(() => null)) as {
                message?: string;
              } | null
            )?.message ?? "No encontramos el lote.",
          );
        return response.json() as Promise<ProductionDetails>;
      })
      .then(setData)
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "No pudimos cargar el lote.",
        ),
      );
  }, [batchId]);
  if (error)
    return (
      <main className="production-page">
        <p role="alert">{error}</p>
      </main>
    );
  if (!data)
    return (
      <main className="production-page">
        <p role="status">Cargando lote…</p>
      </main>
    );
  return (
    <main className="production-page">
      <Link className="text-action" href="/operation/production">
        Volver a producción
      </Link>
      <h1>{data.batch.producedItem}</h1>
      <p>
        Estado: {data.batch.status} · Cantidad: {data.batch.quantity} ·
        Rendimiento: {data.batch.yieldQuantity}
      </p>
      <h2>Consumo relacionado</h2>
      {data.items.length === 0 ? (
        <p>No hay consumos registrados.</p>
      ) : (
        <ul>
          {data.items.map((item) => (
            <li key={item.itemId}>
              {item.name} · {item.quantity} {item.unit}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
