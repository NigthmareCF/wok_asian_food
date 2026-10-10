"use client";
import Link from "next/link";
import {
  useRef,
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import { useLiveCart } from "@/modules/cart/live-cart-provider";
import { usePublicMenu } from "@/modules/menu/use-public-menu";
import {
  createPickupAttemptStore,
  type PickupAttempt,
} from "../pickup-attempt";
import { isPickupReceipt, parsePickupRequest } from "../pickup-contract";
import {
  isWithinPickupWindow,
  nextPickupWindow,
  pickupInputToInstant,
} from "../pickup-window";
import styles from "./checkout.module.css";
import {
  clientIdentityStore,
  createClientOperation,
  type ClientIdentity,
} from "@/modules/clients/client-identity-store";
import { useClientIdentity } from "@/modules/clients/use-client-identity";

const statusLabels: Record<string, string> = {
  PENDING_REVIEW: "Pendiente de revisión",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
  EXPIRED: "Vencida",
};
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency }).format(
    amount,
  );

export function PickupCheckout({ userId }: { userId: string }) {
  const { identity, verified, refresh } = useClientIdentity(userId);
  if (!verified)
    return (
      <section>
        <h1>Solicitud para recoger</h1>
        <p role="status">Verifica tu sesión para continuar.</p>
        <Button onClick={() => void refresh()}>Verificar sesión</Button>
        <Link href="/login?next=%2Fclient%2Fcheckout">Iniciar sesión</Link>
      </section>
    );
  return (
    <VerifiedPickupCheckout
      key={`${identity.ownerId}:${identity.generation}`}
      scope={identity}
    />
  );
}

function VerifiedPickupCheckout({ scope }: { scope: ClientIdentity }) {
  const userId = scope.ownerId!;
  const operations = useRef(
    new Set<ReturnType<typeof createClientOperation>>(),
  );
  useEffect(() => {
    const active = operations.current;
    return () => {
      active.forEach((operation) => operation.dispose());
      active.clear();
    };
  }, []);
  const { items, complete } = useLiveCart();
  const { menu, error: menuError, reload } = usePublicMenu();
  const [store] = useState(() => createPickupAttemptStore(userId));
  const attempt = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const [requestedFor, setRequestedFor] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const sending = useRef(false);
  const products = menu?.categories.flatMap((category) => category.items) ?? [];
  const rows = items.map((item) => ({
    ...item,
    product: products.find((product) => product.id === item.productId),
  }));
  const currencies = new Set(rows.map((row) => row.product?.currency));
  const ready = Boolean(
    menu &&
    items.length &&
    items.length <= 20 &&
    rows.every((row) => row.product && row.quantity <= 50) &&
    currencies.size === 1,
  );
  const preparation = rows.reduce(
    (seconds, row) =>
      seconds + (row.product?.estimatedPreparationSeconds ?? 0) * row.quantity,
    0,
  );
  const subtotal =
    rows.reduce(
      (cents, row) =>
        cents + Math.round((row.product?.price ?? 0) * 100) * row.quantity,
      0,
    ) / 100;
  const pickupWindow = nextPickupWindow(preparation);
  const effectiveRequestedFor =
    requestedFor || pickupWindow?.defaultValue || "";

  async function send(event: FormEvent) {
    event.preventDefault();
    if (
      sending.current ||
      needsUpdate ||
      attempt?.receipt ||
      !clientIdentityStore.matches(scope)
    )
      return;
    let current: PickupAttempt | null = attempt;
    setError("");
    setNeedsLogin(false);
    if (!current) {
      const date = pickupInputToInstant(effectiveRequestedFor);
      if (
        !ready ||
        !date ||
        !pickupWindow ||
        !isWithinPickupWindow(effectiveRequestedFor, pickupWindow)
      ) {
        setError(
          "Elige un horario disponible dentro de las próximas 3 horas y del servicio de 14:00 a 22:00.",
        );
        return;
      }
      const payload = parsePickupRequest({
        requestedFor: date.toISOString(),
        customerNote: note,
        items: items.map((item) => ({
          menuItemId: item.productId,
          quantity: item.quantity,
        })),
      });
      if (!payload) {
        setError(
          "La solicitud admite hasta 20 productos, 50 unidades por producto y 500 caracteres de nota.",
        );
        return;
      }
      current = { key: crypto.randomUUID(), payload, mayHaveBeenSent: false };
      try {
        store.save(current);
      } catch {
        setError(
          "Permite el almacenamiento de esta pestaña antes de enviar la solicitud.",
        );
        return;
      }
    }
    sending.current = true;
    setBusy(true);
    const operation = createClientOperation(scope);
    operations.current.add(operation);
    try {
      if (!(await operation.confirm()) || !operation.valid()) return;
      // Sin marca (intento legacy), no podemos descartar un envio anterior.
      const canDiscardOnRejection = current.mayHaveBeenSent === false;
      if (canDiscardOnRejection) {
        current = { ...current, mayHaveBeenSent: true };
        store.save(current);
      }
      const response = await fetch("/bff/order-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": current.key,
          "X-Wok-Expected-Principal": scope.ownerId!,
        },
        body: JSON.stringify(current.payload),
        signal: operation.signal,
      });
      if (!operation.valid()) return;
      const data: unknown = await response.json();
      if (!operation.valid()) return;
      if (response.status === 401) {
        clientIdentityStore.invalidate();
        return;
      }
      if (
        data &&
        typeof data === "object" &&
        "code" in data &&
        ((response.status === 409 &&
          data.code === "CLIENT_PRINCIPAL_CHANGED") ||
          (response.status === 503 &&
            data.code === "CLIENT_PRINCIPAL_UNVERIFIED"))
      ) {
        clientIdentityStore.invalidate();
        return;
      }
      if (!(await operation.confirm()) || !operation.valid()) return;
      if (!response.ok) {
        if (
          response.status === 409 &&
          data &&
          typeof data === "object" &&
          "code" in data &&
          data.code === "CLIENT_UPDATE_REQUIRED"
        ) {
          setNeedsUpdate(true);
          setError(
            "Actualiza esta pestaña para continuar. No cierres la pestaña ni borres sus datos. Después, reintenta la misma solicitud.",
          );
          return;
        }
        if (canDiscardOnRejection && [400, 422].includes(response.status))
          store.save(null);
        setNeedsLogin(response.status === 401);
        const message =
          data &&
          typeof data === "object" &&
          "message" in data &&
          typeof data.message === "string"
            ? data.message
            : "No pudimos confirmar la solicitud. Reintenta sin cambiar los datos.";
        setError(message);
        return;
      }
      if (!isPickupReceipt(data)) throw new Error("Invalid receipt");
      store.save({ ...current, receipt: data });
      complete(current.payload.items);
    } catch {
      if (!(await operation.confirm()) || !operation.valid()) return;
      setError(
        "No pudimos confirmar el resultado. Conservamos tu solicitud: reintenta para recuperar el comprobante sin duplicarla.",
      );
    } finally {
      if (operation.valid()) {
        sending.current = false;
        setBusy(false);
      }
      operation.dispose();
      operations.current.delete(operation);
    }
  }

  const receipt = attempt?.receipt;
  return (
    <div className={styles.checkout}>
      <header className={styles.header}>
        <h1>Solicitud para recoger</h1>
      </header>
      {receipt ? (
        <section
          className={styles.summary}
          aria-label="Comprobante de solicitud"
        >
          <h2>Solicitud registrada</h2>
          <Link href={`/client/orders/${receipt.requestId}`}>
            Ver estado actual de la solicitud
          </Link>
          <p>
            Estado al recibir el comprobante:{" "}
            <strong>{statusLabels[receipt.status]}</strong>
          </p>
          <p>
            Código: <strong>{receipt.requestId}</strong>
          </p>
          <p>
            Horario solicitado:{" "}
            {new Date(receipt.requestedFor).toLocaleString("es-GT")}
          </p>
          <p>
            Subtotal calculado por el restaurante:{" "}
            {money(receipt.subtotal, receipt.currency)}
          </p>
          <p>
            Este comprobante no confirma disponibilidad ni registra un pago. El
            restaurante debe revisar tu solicitud.
          </p>
          <Button
            onClick={() => {
              if (!clientIdentityStore.matches(scope)) return;
              try {
                store.save(null);
                setError("");
              } catch {
                setError("No se pudo cerrar el comprobante.");
              }
            }}
          >
            Preparar otra solicitud
          </Button>
          <Link href="/client/menu">Volver al menú</Link>
        </section>
      ) : (
        <>
          <Link className="button button--secondary" href="/client/cart">
            Volver al carrito
          </Link>
          <p>
            Por ahora puedes solicitar productos para recoger. El restaurante
            debe aceptar la solicitud antes de considerarla un pedido
            confirmado.
          </p>
          {attempt ? (
            <section className={styles.summary}>
              <h2>Solicitud guardada para reintentar</h2>
              <p>
                Usaremos los mismos productos y horario para recuperar el
                resultado sin duplicarlo.
              </p>
              <p>
                {attempt.payload.items.reduce(
                  (sum, item) => sum + item.quantity,
                  0,
                )}{" "}
                unidades ·{" "}
                {new Date(attempt.payload.requestedFor).toLocaleString("es-GT")}
              </p>
            </section>
          ) : !items.length ? (
            <p>
              Tu carrito está vacío.{" "}
              <Link href="/client/menu">Agregar productos</Link>
            </p>
          ) : (
            <section className={styles.summary}>
              <h2>Revisa tu solicitud</h2>
              {rows.map((row) => (
                <p key={row.productId}>
                  {row.quantity} × {row.product?.name ?? row.name}
                  {menu && !row.product ? " — Ya no está en el catálogo" : ""}
                </p>
              ))}
              {ready ? (
                <>
                  <p>
                    Subtotal estimado:{" "}
                    {money(subtotal, rows[0].product!.currency)}
                  </p>
                  <p>
                    Preparación estimada: {Math.ceil(preparation / 60)} minutos.
                  </p>
                </>
              ) : (
                <p>
                  {menuError
                    ? "No se pudieron consultar los precios."
                    : !menu
                      ? "Consultando el catálogo…"
                      : "Revisa el carrito: máximo 20 productos, 50 unidades de cada uno, publicados y en la misma moneda."}
                </p>
              )}
              <Button variant="secondary" onClick={reload}>
                Actualizar catálogo
              </Button>
            </section>
          )}
          {(attempt || items.length > 0) && (
            <form onSubmit={send} className={styles.card}>
              {!attempt && (
                <>
                  <FormField
                    id="pickup-time"
                    label="Fecha y hora para recoger"
                    help={
                      pickupWindow
                        ? "Horario de Guatemala. Incluye preparación y margen de revisión; puedes programar dentro de las próximas 3 horas, entre 14:00 y 22:00."
                        : "No hay horarios disponibles durante las próximas 3 horas."
                    }
                    type="datetime-local"
                    required
                    min={pickupWindow?.min}
                    max={pickupWindow?.max}
                    disabled={!pickupWindow}
                    value={effectiveRequestedFor}
                    onChange={(event) => setRequestedFor(event.target.value)}
                  />
                  <FormField
                    id="pickup-note"
                    label="Nota para el restaurante (opcional)"
                    maxLength={500}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </>
              )}
              <p>
                El servidor calculará el importe final con los precios vigentes.
                Enviar no reserva existencias ni realiza un cobro.
              </p>
              <Button
                fullWidth
                type="submit"
                disabled={busy || needsUpdate || (!attempt && !ready)}
              >
                {busy
                  ? "Enviando solicitud…"
                  : attempt
                    ? "Reintentar la misma solicitud"
                    : "Enviar solicitud para recoger"}
              </Button>
            </form>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {needsUpdate && (
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Actualizar esta pestaña
        </Button>
      )}
      {needsLogin && (
        <Link href="/login?next=%2Fclient%2Fcheckout">
          Iniciar sesión y recuperar la solicitud
        </Link>
      )}
    </div>
  );
}
