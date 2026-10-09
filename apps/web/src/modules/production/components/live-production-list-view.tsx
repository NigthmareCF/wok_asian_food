"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductionBatch } from "../live-contract";
export function LiveProductionListView() {
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/bff/operational/production", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            (
              (await response.json().catch(() => null)) as {
                message?: string;
              } | null
            )?.message ?? "No pudimos cargar producción.",
          );
        return response.json() as Promise<ProductionBatch[]>;
      })
      .then((value) => {
        if (active) setBatches(value);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No pudimos cargar producción.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  if (loading)
    return (
      <main className="production-page">
        <p role="status">Cargando producción…</p>
      </main>
    );
  if (error)
    return (
      <main className="production-page">
        <p role="alert">{error}</p>
      </main>
    );
  return (
    <main className="production-page">
      <header className="ops-page-header production-page__header">
        <div>
          <span className="ops-kicker">Módulo operativo</span>
          <h1>Producción</h1>
          <p>Estados y lotes provienen del backend.</p>
        </div>
      </header>
      {batches.length === 0 ? (
        <p>No hay lotes de producción.</p>
      ) : (
        <section className="production-list" aria-label="Lotes de producción">
          {batches.map((batch) => (
            <Link
              className="production-row"
              href={`/operation/production/${batch.batchId}`}
              key={batch.batchId}
            >
              <strong>{batch.producedItem}</strong>
              <span>
                {batch.status} · {batch.quantity} · rendimiento{" "}
                {batch.yieldQuantity}
              </span>
              <small>
                {batch.areaCode ?? "Sin área"} ·{" "}
                {new Date(batch.producedAt).toLocaleString("es-GT")}
              </small>
            </Link>
          ))}
        </section>
      )}
      <p>
        Proveedores, compras y lotes de inventario no tienen contrato conectado.
      </p>
    </main>
  );
}
