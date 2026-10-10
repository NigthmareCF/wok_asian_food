"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useInventorySession } from "../inventory-session-provider";
export function InventoryDetailView({ itemId }: { itemId: string }) {
  const { details, recordMovement, actionLoading, error } =
    useInventorySession();
  const [data, setData] = useState<Awaited<ReturnType<typeof details>>>(null);
  const [type, setType] = useState<"ENTRY" | "ADJUSTMENT" | "WASTE">("ENTRY");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    void details(itemId).then(setData);
  }, [details, itemId]);
  if (!data)
    return (
      <main className="inventory-page">
        <Link className="text-action" href="/operation/inventory">
          Volver a inventario
        </Link>
        <p role={error ? "alert" : "status"}>{error ?? "Cargando item…"}</p>
      </main>
    );
  const { item, movements } = data;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      await recordMovement(itemId, type, Number(quantity), reason || undefined)
    ) {
      setFeedback("Movimiento registrado y existencias recargadas.");
      setQuantity("");
      setReason("");
      const next = await details(itemId);
      setData(next);
    }
  };
  return (
    <main className="inventory-page inventory-detail">
      <header className="ops-page-header inventory-page__header">
        <div>
          <Link className="text-action" href="/operation/inventory">
            Volver a inventario
          </Link>
          <span className="ops-kicker">Inventario · {item.sku}</span>
          <h1>{item.name}</h1>
          <p>
            {item.status} · unidad {item.unit}
          </p>
        </div>
      </header>
      {feedback ? <p role="status">{feedback}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <section className="inventory-detail__summary" aria-label="Existencias">
        <div>
          <span>En existencia</span>
          <strong>
            {item.quantityOnHand} {item.unit}
          </strong>
        </div>
        <div>
          <span>Reservado</span>
          <strong>
            {item.quantityReserved} {item.unit}
          </strong>
        </div>
        <div>
          <span>Disponible</span>
          <strong>
            {item.quantityAvailable} {item.unit}
          </strong>
        </div>
        <div>
          <span>Mínimo</span>
          <strong>
            {item.minimumStock} {item.unit}
          </strong>
        </div>
      </section>
      <form
        className="inventory-actions-bar"
        onSubmit={submit}
        aria-label="Registrar movimiento"
      >
        <h2>Registrar movimiento</h2>
        <select
          aria-label="Tipo de movimiento"
          value={type}
          onChange={(event) => setType(event.target.value as typeof type)}
        >
          <option value="ENTRY">Entrada</option>
          <option value="ADJUSTMENT">Ajuste</option>
          <option value="WASTE">Merma</option>
        </select>
        <input
          aria-label="Cantidad"
          required
          min="0"
          step="0.01"
          type="number"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <input
          aria-label="Motivo"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo para ajuste o merma"
        />
        <button
          className="button button--primary"
          disabled={actionLoading}
          type="submit"
        >
          {actionLoading ? "Guardando…" : "Registrar"}
        </button>
      </form>
      <section>
        <h2>Movimientos</h2>
        {movements.length === 0 ? (
          <p>No hay movimientos registrados.</p>
        ) : (
          <ul>
            {movements.map((movement) => (
              <li key={movement.id}>
                {movement.type} · {movement.quantityDelta} {item.unit} ·{" "}
                {movement.reason ?? "Sin motivo"} · {movement.responsibleUserId}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p>
        Lotes, edición de recetas, compras y proveedores siguen pendientes.
        Registrar una entrada modifica existencias; no registra una compra.
      </p>
    </main>
  );
}
