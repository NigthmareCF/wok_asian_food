"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useLiveResource } from "@/modules/operation/use-live-resource";
import { useLiveMutation } from "@/modules/operation/use-live-mutation";
import { isOperationalTables } from "@/modules/tables/live-contract";
import { usePublicMenu } from "@/modules/menu/use-public-menu";
import {
  isOrderReceipt,
  parseCreateOrder,
  type CreateOrder,
  type OrderReceipt,
} from "../live-contract";
import { orderAttempt, type CreateAttempt } from "../create-attempt";
import { amount } from "../live-mapping";
import styles from "@/modules/operation/operational-flow.module.css";
export function NewOrderView({
  initialAccountId = "",
}: {
  initialAccountId?: string;
}) {
  const tables = useLiveResource(
      "/bff/operational/tables",
      isOperationalTables,
    ),
    menu = usePublicMenu(),
    mutation = useLiveMutation();
  const [accountId, setAccountId] = useState(initialAccountId),
    [guestCount, setGuestCount] = useState(1),
    [notes, setNotes] = useState("");
  const [items, setItems] = useState<CreateOrder["items"]>([]),
    [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const attempt = useRef<CreateAttempt | null>(null);
  const accounts =
    tables.data?.filter((t) => t.accountStatus === "OPEN" && t.accountId) ?? [];
  const products = menu.menu?.categories.flatMap((c) => c.items) ?? [];
  const payload = parseCreateOrder({
    accountId,
    channel: "DINE_IN",
    guestCount,
    notes,
    items,
  });
  const valid =
    !!payload &&
    accounts.some((t) => t.accountId === accountId) &&
    items.every((i) => products.some((p) => p.id === i.menuItemId));
  function edited() {
    attempt.current = null;
    setReceipt(null);
  }
  function update(id: string, patch: Partial<CreateOrder["items"][number]>) {
    edited();
    setItems((current) =>
      current
        .map((i) => (i.menuItemId === id ? { ...i, ...patch } : i))
        .filter((i) => i.quantity > 0),
    );
  }
  function reload() {
    tables.reload();
    menu.reload();
  }
  function submit() {
    if (!payload || !valid || mutation.sending || receipt) return;
    attempt.current = orderAttempt(payload, attempt.current);
    void mutation.run({
      url: "/bff/operational/orders",
      method: "POST",
      body: payload,
      key: attempt.current.key,
      validate: isOrderReceipt,
      reload,
      success: (value) => {
        setReceipt(value);
        attempt.current = null;
      },
    });
  }
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Nuevo pedido</h1>
        <Link href="/operation/orders">Volver a pedidos</Link>
        <button
          className="button button--secondary"
          onClick={reload}
          disabled={mutation.sending}
        >
          Actualizar datos
        </button>
      </header>
      {mutation.error && <p role="alert">{mutation.error}</p>}
      {(tables.error || menu.error) && (
        <p role="alert">
          {tables.error || "No pudimos cargar el menú. Actualiza los datos."}
        </p>
      )}
      {(!tables.data || !menu.menu) && !tables.error && !menu.error && (
        <p role="status">Cargando cuentas y menú…</p>
      )}
      {tables.data && accounts.length === 0 && (
        <p>
          Abre una mesa para disponer de una cuenta abierta.{" "}
          <Link href="/operation/tables">Ir a mesas</Link>
        </p>
      )}
      {receipt && (
        <section className={styles.notice} role="status">
          <h2>Pedido creado: {receipt.code}</h2>
          <p>Total confirmado: {amount(receipt.total, receipt.currency)}</p>
          <Link href={"/operation/orders/" + receipt.orderId}>
            Ver pedido
          </Link>{" "}
          · <Link href="/operation/kitchen">Ver cocina</Link>
        </section>
      )}
      <form
        aria-label="Crear pedido"
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <fieldset disabled={mutation.sending || !!receipt}>
          <legend>Cuenta y productos</legend>
          <div className={styles.grid}>
            <label>
              Cuenta abierta
              <select
                value={accountId}
                onChange={(e) => {
                  edited();
                  setAccountId(e.target.value);
                }}
                required
              >
                <option value="">Selecciona una cuenta</option>
                {accounts.map((t) => (
                  <option key={t.accountId} value={t.accountId!}>
                    {t.name} · {t.accountName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Personas
              <input
                type="number"
                min={1}
                step={1}
                required
                value={guestCount}
                onChange={(e) => {
                  edited();
                  setGuestCount(Number(e.target.value));
                }}
              />
            </label>
          </div>
          <label>
            Notas del pedido
            <textarea
              maxLength={500}
              value={notes}
              onChange={(e) => {
                edited();
                setNotes(e.target.value);
              }}
            />
          </label>
          <h2>Menú</h2>
          {menu.menu?.categories.map((category) => (
            <section key={category.id}>
              <h3>{category.name}</h3>
              <div className={styles.grid}>
                {category.items.map((product) => (
                  <article className={styles.card} key={product.id}>
                    <h4>{product.name}</h4>
                    <p>{amount(product.price, product.currency)} por unidad</p>
                    <button
                      type="button"
                      className="button button--secondary"
                      disabled={
                        items.some((i) => i.menuItemId === product.id) ||
                        items.length >= 50
                      }
                      onClick={() => {
                        edited();
                        setItems((current) => [
                          ...current,
                          {
                            menuItemId: product.id,
                            quantity: 1,
                            fulfillment: "DINE_IN",
                            notes: "",
                          },
                        ]);
                      }}
                    >
                      Agregar {product.name}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}
          <h2>Productos seleccionados</h2>
          {!items.length && <p>Agrega productos del menú.</p>}
          <div className={styles.grid}>
            {items.map((item) => (
              <article className={styles.card} key={item.menuItemId}>
                <h3>
                  {products.find((p) => p.id === item.menuItemId)?.name ??
                    "Producto no disponible"}
                </h3>
                <label>
                  Cantidad
                  <input
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={item.quantity}
                    onChange={(e) =>
                      update(item.menuItemId, {
                        quantity: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Servicio
                  <select
                    value={item.fulfillment}
                    onChange={(e) =>
                      update(item.menuItemId, {
                        fulfillment: e.target.value as "DINE_IN" | "TAKEAWAY",
                      })
                    }
                  >
                    <option value="DINE_IN">En mesa</option>
                    <option value="TAKEAWAY">Para llevar</option>
                  </select>
                </label>
                <label>
                  Notas del producto
                  <textarea
                    maxLength={300}
                    value={item.notes ?? ""}
                    onChange={(e) =>
                      update(item.menuItemId, { notes: e.target.value })
                    }
                  />
                </label>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => update(item.menuItemId, { quantity: 0 })}
                >
                  Quitar producto
                </button>
              </article>
            ))}
          </div>
        </fieldset>
        <p>
          Los precios del menú son informativos. El total se confirma al crear
          el pedido.
        </p>
        <button
          className="button button--primary"
          disabled={
            !valid ||
            mutation.sending ||
            !!receipt ||
            !!tables.error ||
            !!menu.error
          }
        >
          {mutation.sending ? "Enviando…" : "Crear pedido"}
        </button>
      </form>
    </div>
  );
}
