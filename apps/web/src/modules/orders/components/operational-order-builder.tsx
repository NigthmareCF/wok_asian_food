"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClientIdentity } from "@/modules/clients/use-client-identity";
import { createClientOperation } from "@/modules/clients/client-identity-store";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  createOrderAttemptStore,
  type OrderAttempt,
} from "../order-attempt-store";
import {
  ArrowLeft,
  CircleAlert,
  Minus,
  Package,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { usePublicMenu } from "@/modules/menu/use-public-menu";
import type { PublicMenuItem } from "@/modules/menu/public-menu";
import {
  isOperationalOrderDetails,
  isOperationalOrderReceipt,
  type CreateOperationalOrder,
} from "../live-contract";

type CartLine = {
  item: PublicMenuItem;
  category: string;
  quantity: number;
  fulfillment: "DINE_IN" | "TAKEAWAY";
  notes: string;
};

function message(body: unknown) {
  return body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
    ? body.message
    : "No pudimos enviar el pedido.";
}

export function OperationalOrderBuilder({
  accountId,
  accountName,
  orderId,
  userId,
}: {
  accountId?: string;
  accountName?: string;
  orderId?: string;
  userId?: string;
}) {
  const router = useRouter();
  const [ownerId] = useState(userId);
  const { identity, verified, refresh } = useClientIdentity(ownerId);
  const operationRef = useRef<ReturnType<typeof createClientOperation> | null>(
    null,
  );
  const { menu, error: menuError, reload } = usePublicMenu();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [guestCount, setGuestCount] = useState(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState("");
  const sendingScope = JSON.stringify([
    identity.generation,
    userId,
    accountId,
    orderId,
  ]);
  const [activeSendingScope, setActiveSendingScope] = useState<string | null>(
    null,
  );
  const sending =
    activeSendingScope === sendingScope && verified && userId === ownerId;
  const setSending = (value: boolean) =>
    setActiveSendingScope(value ? sendingScope : null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [store] = useState(() =>
    createOrderAttemptStore(userId, accountId, orderId),
  );
  const attempt = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const attemptRef = useRef<OrderAttempt | null>(attempt);
  useLayoutEffect(() => {
    attemptRef.current = attempt;
  }, [attempt]);
  const inFlight = useRef(false);
  const targetRef = useRef({ accountId, orderId, userId });
  useLayoutEffect(() => {
    targetRef.current = { accountId, orderId, userId };
    return () => operationRef.current?.dispose();
  }, [accountId, orderId, userId, identity]);
  const identityValid = Boolean(ownerId && userId === ownerId && verified);
  const locked =
    !identityValid || sending || attempt !== null || Boolean(store.getNotice());
  const targetChanged =
    attempt !== null &&
    (attempt.accountId !== accountId || attempt.orderId !== orderId);

  function retainAttempt(value: OrderAttempt | null) {
    store.save(value);
    attemptRef.current = value;
  }

  const items = useMemo(
    () =>
      (menu?.categories ?? [])
        .filter((entry) => category === "all" || entry.id === category)
        .flatMap((entry) =>
          entry.items.map((item) => ({ ...item, category: entry.name })),
        )
        .filter((item) => {
          const normalized = query.trim().toLocaleLowerCase("es");
          return (
            !normalized ||
            item.name.toLocaleLowerCase("es").includes(normalized) ||
            item.description?.toLocaleLowerCase("es").includes(normalized)
          );
        }),
    [category, menu, query],
  );
  const total = cart.reduce(
    (sum, line) => sum + line.item.price * line.quantity,
    0,
  );
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);

  function add(item: PublicMenuItem, itemCategory: string) {
    if (!identityValid || attemptRef.current || inFlight.current) return;
    setCart((current) => {
      const existing = current.find(
        (line) =>
          line.item.id === item.id &&
          line.fulfillment === "DINE_IN" &&
          !line.notes,
      );
      if (!existing)
        return [
          ...current,
          {
            item,
            category: itemCategory,
            quantity: 1,
            fulfillment: "DINE_IN",
            notes: "",
          },
        ];
      return current.map((line) =>
        line === existing ? { ...line, quantity: line.quantity + 1 } : line,
      );
    });
  }

  function update(index: number, patch: Partial<CartLine>) {
    if (!identityValid || attemptRef.current || inFlight.current) return;
    setCart((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function changeQuantity(index: number, delta: number) {
    if (!identityValid || attemptRef.current || inFlight.current) return;
    setCart((current) =>
      current
        .map((line, lineIndex) =>
          lineIndex === index
            ? { ...line, quantity: line.quantity + delta }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  async function submit() {
    if (
      !accountId ||
      !identityValid ||
      (!cart.length && !attemptRef.current) ||
      inFlight.current ||
      store.getNotice()
    )
      return;
    const previous = attemptRef.current;
    if (
      previous &&
      (previous.confirmed ||
        previous.ownerId !== ownerId ||
        previous.accountId !== accountId ||
        previous.orderId !== orderId)
    )
      return;
    inFlight.current = true;
    const operation = createClientOperation(identity);
    operationRef.current = operation;
    const valid = () =>
      operation.valid() &&
      targetRef.current.userId === ownerId &&
      targetRef.current.accountId === accountId &&
      targetRef.current.orderId === orderId;
    setSending(true);
    setFeedback("");
    setError("");
    const items = cart.map((line) => ({
      menuItemId: line.item.id,
      quantity: line.quantity,
      fulfillment: line.fulfillment,
      ...(line.notes.trim() ? { notes: line.notes.trim() } : {}),
    }));
    const payload: CreateOperationalOrder = {
      accountId,
      channel: "DINE_IN",
      guestCount,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      items,
    };
    try {
      if (!(await operation.confirm()) || !valid()) return;
      const current: OrderAttempt = previous ?? {
        ownerId,
        accountId,
        orderId,
        url: orderId
          ? `/bff/operational/orders/${orderId}/items`
          : "/bff/operational/orders",
        body: JSON.stringify(orderId ? { items } : payload),
        key: crypto.randomUUID(),
        uncertain: false,
        confirmed: false,
      };
      retainAttempt({ ...current, uncertain: true });
      const response = await fetch(current.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": current.key,
          "X-Request-Id": crypto.randomUUID(),
          "X-Wok-Expected-Principal": current.ownerId!,
        },
        body: current.body,
        signal: operation.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!valid() || !(await operation.confirm()) || !valid()) return;
      if (!response.ok) {
        // The BFF conflates business conflicts and pending claims (409).
        // A later rejection cannot rule out an earlier committed request.
        if (
          !current.uncertain &&
          [400, 401, 403, 404, 422].includes(response.status)
        )
          retainAttempt(null);
        throw new Error(message(body));
      }
      const resultingOrderId = current.orderId
        ? isOperationalOrderDetails(body) &&
          body.order.id === current.orderId &&
          body.order.accountId === current.accountId
          ? body.order.id
          : null
        : isOperationalOrderReceipt(body)
          ? body.orderId
          : null;
      if (!resultingOrderId)
        throw new Error("La respuesta del pedido no fue válida.");
      retainAttempt({
        ...current,
        resultingOrderId,
        confirmed: true,
        uncertain: false,
      });
      if (
        targetRef.current.accountId !== current.accountId ||
        targetRef.current.orderId !== current.orderId
      )
        return;
      setFeedback(
        current.orderId
          ? "Productos enviados a cocina."
          : "Pedido enviado a cocina.",
      );
      router.push(`/operation/orders/${resultingOrderId}`);
    } catch (cause) {
      if (!valid()) return;
      if (attemptRef.current && !attemptRef.current.confirmed) {
        try {
          retainAttempt({ ...attemptRef.current, uncertain: true });
        } catch {
          /* El intento previo permanece guardado. */
        }
      }
      setError(
        cause instanceof Error ? cause.message : "No pudimos enviar el pedido.",
      );
    } finally {
      const publish = valid();
      operation.dispose();
      if (operationRef.current === operation) operationRef.current = null;
      inFlight.current = false;
      if (publish) setSending(false);
    }
  }

  if (!accountId)
    return (
      <div className="orders-page order-not-found">
        <Link className="text-action" href="/operation/tables">
          <ArrowLeft aria-hidden="true" size={16} /> Volver a mesas
        </Link>
        <div className="ops-empty-state">
          <CircleAlert aria-hidden="true" size={24} />
          <strong>Abre una mesa antes de tomar el pedido</strong>
          <span>La cuenta de mesa debe existir en el servidor.</span>
        </div>
      </div>
    );

  return (
    <div className="orders-page order-builder">
      <header className="ops-page-header orders-page__header">
        <div>
          <Link className="text-action" href="/operation/tables">
            <ArrowLeft aria-hidden="true" size={16} /> Volver a mesas
          </Link>
          <span className="ops-kicker">Nueva comanda</span>
          <h1>{orderId ? "Agregar productos" : "Tomar pedido"}</h1>
          <p>Cuenta de {accountName ?? "mesa abierta"}</p>
        </div>
        <span className="order-cart-counter">
          <ShoppingCart aria-hidden="true" size={18} /> {count} productos
        </span>
      </header>

      {store.getNotice() ? <p role="alert">{store.getNotice()}</p> : null}
      {!identityValid && (
        <div role="alert">
          <p>
            La identidad de este formulario no está verificada o cambió. El
            intento anterior permanece con su propietario. Vuelve a abrir el
            formulario con la cuenta original.
          </p>
          <button type="button" onClick={() => void refresh()}>
            Verificar sesión
          </button>
        </div>
      )}
      {error ? (
        <div className="ops-inline-feedback" role="alert">
          <CircleAlert aria-hidden="true" size={18} /> <span>{error}</span>
        </div>
      ) : null}
      {feedback ? <p role="status">{feedback}</p> : null}
      {attempt?.confirmed ? (
        <div>
          <p>El envío anterior ya fue confirmado.</p>
          {attempt.resultingOrderId && (
            <Link
              className="text-action"
              href={`/operation/orders/${attempt.resultingOrderId}`}
            >
              Consultar pedido confirmado
            </Link>
          )}
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              try {
                retainAttempt(null);
                setCart([]);
                setNotes("");
                setError("");
              } catch {
                setError("No pudimos cerrar el intento confirmado.");
              }
            }}
          >
            Preparar otro envío
          </button>
        </div>
      ) : null}
      {attempt?.uncertain || targetChanged ? (
        <div className="ops-inline-feedback" role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          <span>
            {attempt?.confirmed
              ? "El envio de la cuenta original fue confirmado."
              : "Resultado pendiente de confirmar. Se conserva el envio original."}{" "}
            Cuenta: {attempt?.accountId}.{" "}
            {attempt?.orderId
              ? `Pedido: ${attempt.orderId}.`
              : "Creacion de pedido."}{" "}
            {targetChanged
              ? "Vuelve a la cuenta y al pedido originales para continuar."
              : "Puedes reintentar el mismo envio sin cambiar los productos."}{" "}
            El intento se conserva en esta pestaña al recargar. Consulta el
            pedido antes de preparar otro envío.
          </span>
        </div>
      ) : null}

      <section className="order-origin" aria-label="Datos del pedido">
        <div>
          <h2>Atención en mesa</h2>
          <p>
            {orderId
              ? "Solo se enviarán los productos nuevos a cocina."
              : "El pedido se registra en la cuenta abierta y crea comandas por estación."}
          </p>
        </div>
        <label className="order-field">
          <span>Personas</span>
          <input
            disabled={locked}
            min={1}
            onChange={(event) =>
              setGuestCount(Math.max(1, Number(event.target.value)))
            }
            type="number"
            value={guestCount}
          />
        </label>
      </section>

      <div className="order-builder__layout">
        <main className="order-catalog">
          {menuError ? (
            <div className="ops-empty-state">
              <strong>No pudimos cargar el menú</strong>
              <button
                className="button button--secondary"
                onClick={reload}
                type="button"
              >
                Reintentar
              </button>
            </div>
          ) : !menu ? (
            <div className="ops-empty-state" role="status">
              <strong>Cargando menú…</strong>
            </div>
          ) : (
            <>
              <div className="orders-toolbar order-catalog__toolbar">
                <div className="orders-filter" aria-label="Categorías">
                  {[{ id: "all", name: "Todos" }, ...menu.categories].map(
                    (entry) => (
                      <button
                        aria-pressed={category === entry.id}
                        key={entry.id}
                        onClick={() => setCategory(entry.id)}
                        type="button"
                      >
                        {entry.name}
                      </button>
                    ),
                  )}
                </div>
                <label className="orders-search">
                  <Search aria-hidden="true" size={18} />
                  <span className="sr-only">Buscar producto</span>
                  <input
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar producto"
                    type="search"
                    value={query}
                  />
                </label>
              </div>
              <div className="product-grid">
                {items.map((item) => (
                  <article
                    className="product-card product-card--success"
                    key={item.id}
                  >
                    <div className="product-card__top">
                      <span>{item.category}</span>
                    </div>
                    <div className="product-card__body">
                      <h3>{item.name}</h3>
                      {item.description ? <p>{item.description}</p> : null}
                    </div>
                    <div className="product-card__footer">
                      <strong>
                        {item.currency} {item.price.toFixed(2)}
                      </strong>
                      <button
                        disabled={locked}
                        aria-label={`Agregar ${item.name}`}
                        className="icon-button product-card__add"
                        onClick={() => add(item, item.category)}
                        type="button"
                      >
                        <Plus aria-hidden="true" size={19} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </main>

        <aside className="order-cart" aria-labelledby="cart-title">
          <div className="order-cart__heading">
            <div>
              <span>Comanda actual</span>
              <h2 id="cart-title">{accountName ?? "Cuenta abierta"}</h2>
            </div>
            <strong>{count}</strong>
          </div>
          <div className="order-cart__items">
            {cart.map((line, index) => (
              <div className="cart-item" key={`${line.item.id}-${index}`}>
                <div className="cart-item__heading">
                  <div>
                    <strong>{line.item.name}</strong>
                    <small>{line.category}</small>
                  </div>
                  <strong>
                    {line.item.currency}{" "}
                    {(line.item.price * line.quantity).toFixed(2)}
                  </strong>
                </div>
                <div className="quantity-control">
                  <button
                    disabled={locked}
                    aria-label={`Restar ${line.item.name}`}
                    onClick={() => changeQuantity(index, -1)}
                    type="button"
                  >
                    <Minus aria-hidden="true" size={15} />
                  </button>
                  <span>{line.quantity}</span>
                  <button
                    disabled={locked}
                    aria-label={`Sumar ${line.item.name}`}
                    onClick={() => changeQuantity(index, 1)}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={15} />
                  </button>
                  <button
                    disabled={locked}
                    aria-label={`Quitar ${line.item.name}`}
                    className="quantity-control__remove"
                    onClick={() =>
                      setCart((current) =>
                        current.filter((_, lineIndex) => lineIndex !== index),
                      )
                    }
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                </div>
                <label className="order-field">
                  <span>Nota para cocina</span>
                  <input
                    disabled={locked}
                    maxLength={300}
                    onChange={(event) =>
                      update(index, { notes: event.target.value })
                    }
                    value={line.notes}
                  />
                </label>
                <button
                  disabled={locked}
                  aria-pressed={line.fulfillment === "TAKEAWAY"}
                  className="button button--secondary button--compact"
                  onClick={() =>
                    update(index, {
                      fulfillment:
                        line.fulfillment === "DINE_IN" ? "TAKEAWAY" : "DINE_IN",
                    })
                  }
                  type="button"
                >
                  <Package aria-hidden="true" size={15} />{" "}
                  {line.fulfillment === "TAKEAWAY"
                    ? "Para llevar"
                    : "Consumir en mesa"}
                </button>
              </div>
            ))}
          </div>
          <label className="order-field">
            <span>Nota general</span>
            <textarea
              disabled={locked}
              maxLength={500}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              value={notes}
            />
          </label>
          <div className="order-cart__total">
            <span>Total</span>
            <strong>
              {cart[0]?.item.currency ?? "GTQ"} {total.toFixed(2)}
            </strong>
          </div>
          <button
            className="button button--primary button--full"
            disabled={
              !identityValid ||
              (!cart.length && !attempt) ||
              sending ||
              targetChanged ||
              attempt?.confirmed ||
              Boolean(store.getNotice())
            }
            onClick={() => void submit()}
            type="button"
          >
            <Send aria-hidden="true" size={18} />{" "}
            {sending
              ? "Enviando…"
              : attempt?.confirmed
                ? "Envio confirmado"
                : attempt?.uncertain
                  ? "Reintentar el mismo envio"
                  : orderId
                    ? "Agregar a cocina"
                    : "Enviar a cocina"}
          </button>
        </aside>
      </div>
    </div>
  );
}
