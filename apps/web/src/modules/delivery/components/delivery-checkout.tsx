"use client";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import { useLiveCart } from "@/modules/cart/live-cart-provider";
import { usePublicMenu } from "@/modules/menu/use-public-menu";
import {
  createAttemptStore,
  type Attempt,
} from "@/modules/client-workflows/attempt-store";
import {
  isDeliveryReceipt,
  parseDeliveryRequest,
  type DeliveryRequest,
  type DeliveryReceipt,
} from "../client-contract";
import styles from "@/modules/checkout/components/checkout.module.css";
import {
  isClientAddressList,
  type ClientAddress,
} from "@/modules/profile/address-contract";

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

async function readSavedAddresses(
  signal: AbortSignal,
): Promise<ClientAddress[]> {
  const response = await fetch("/bff/client/addresses", {
    cache: "no-store",
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isClientAddressList(body)) {
    throw new Error("Address book unavailable");
  }
  return body;
}

export function DeliveryCheckout({ userId }: { userId: string }) {
  const { items, complete } = useLiveCart();
  const { menu, error: menuError, reload } = usePublicMenu();
  const [store] = useState(() =>
    createAttemptStore(
      `wok.delivery.attempt.v1:${userId}`,
      parseDeliveryRequest,
      isDeliveryReceipt,
    ),
  );
  const attempt = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const [requestedFor, setRequestedFor] = useState("");
  const [address, setAddress] = useState("");
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<ClientAddress[]>([]);
  const [savedAddressesLoading, setSavedAddressesLoading] = useState(true);
  const [savedAddressesError, setSavedAddressesError] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const addressFieldsEdited = useRef(false);
  const addressFields = useRef({ address: "", reference: "", phone: "" });
  const [payment, setPayment] =
    useState<DeliveryRequest["paymentPreference"]>("CASH_ON_DELIVERY");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const sending = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadSavedAddresses() {
      try {
        const addresses = await readSavedAddresses(controller.signal);
        if (controller.signal.aborted) return;
        setSavedAddresses(addresses);
        if (
          !addressFieldsEdited.current &&
          !addressFields.current.address &&
          !addressFields.current.reference &&
          !addressFields.current.phone
        ) {
          const defaultAddress = addresses.find((item) => item.isDefault);
          if (defaultAddress) {
            setSelectedAddressId(defaultAddress.addressId);
            addressFields.current = {
              address: defaultAddress.address,
              reference: defaultAddress.reference ?? "",
              phone: defaultAddress.contactPhone,
            };
            setAddress(defaultAddress.address);
            setReference(defaultAddress.reference ?? "");
            setPhone(defaultAddress.contactPhone);
          }
        }
      } catch {
        if (!controller.signal.aborted) setSavedAddressesError(true);
      } finally {
        if (!controller.signal.aborted) setSavedAddressesLoading(false);
      }
    }
    void loadSavedAddresses();
    return () => controller.abort();
  }, []);

  function selectSavedAddress(value: string) {
    addressFieldsEdited.current = true;
    setSelectedAddressId(value);
    if (!value) return;
    const selected = savedAddresses.find((item) => item.addressId === value);
    if (!selected) return;
    setAddress(selected.address);
    setReference(selected.reference ?? "");
    setPhone(selected.contactPhone);
    addressFields.current = {
      address: selected.address,
      reference: selected.reference ?? "",
      phone: selected.contactPhone,
    };
  }
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

  async function send(event: FormEvent) {
    event.preventDefault();
    if (sending.current || attempt?.receipt) return;
    let current: Attempt<DeliveryRequest, DeliveryReceipt> | null = attempt;
    setError("");
    setNeedsLogin(false);
    if (!current) {
      const date = new Date(requestedFor);
      if (
        !ready ||
        !Number.isFinite(date.getTime()) ||
        date.getTime() <= Date.now() + preparation * 1000
      ) {
        setError(
          "Revisa el carrito y elige un horario posterior al tiempo de preparación.",
        );
        return;
      }
      const payload = parseDeliveryRequest({
        requestedFor: date.toISOString(),
        customerNote: note,
        address,
        reference,
        contactPhone: phone,
        paymentPreference: payment,
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
      current = { key: crypto.randomUUID(), payload };
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
    try {
      const response = await fetch("/bff/delivery-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": current.key,
        },
        body: JSON.stringify(current.payload),
        signal: AbortSignal.timeout(15_000),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        if ([400, 422].includes(response.status)) store.save(null);
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
      if (!isDeliveryReceipt(data)) throw new Error("Invalid receipt");
      store.save({ ...current, receipt: data });
      complete(current.payload.items);
    } catch {
      setError(
        "No pudimos confirmar el resultado. Conservamos tu solicitud: reintenta para recuperar el comprobante sin duplicarla.",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const receipt = attempt?.receipt;
  return (
    <div className={styles.checkout}>
      <header className={styles.header}>
        <h1>Solicitud de delivery</h1>
        <Link href="/client/delivery/history">Mis solicitudes de delivery</Link>
      </header>
      {receipt ? (
        <section
          className={styles.summary}
          aria-label="Comprobante de solicitud"
        >
          <h2>Solicitud registrada</h2>
          <Link href={`/client/delivery/${receipt.requestId}`}>
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
          <Link href="/menu">Volver al menú</Link>
        </section>
      ) : (
        <>
          <Link className="button button--secondary" href="/client/cart">
            Volver al carrito
          </Link>
          <p>
            Puedes solicitar productos a domicilio. El restaurante debe aceptar
            la solicitud antes de considerarla un pedido confirmado.
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
              Tu carrito está vacío. <Link href="/menu">Agregar productos</Link>
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
                    label="Fecha y hora de delivery"
                    help="Se usa la zona horaria de tu dispositivo. Elige una hora que permita preparar todos los productos."
                    type="datetime-local"
                    required
                    value={requestedFor}
                    onChange={(event) => setRequestedFor(event.target.value)}
                  />
                  <FormField
                    id="delivery-address"
                    label="Dirección de entrega"
                    required
                    minLength={5}
                    maxLength={500}
                    value={address}
                    onChange={(e) => {
                      addressFieldsEdited.current = true;
                      addressFields.current.address = e.target.value;
                      setSelectedAddressId("");
                      setAddress(e.target.value);
                    }}
                  />
                  <label htmlFor="delivery-saved-address">
                    Dirección guardada
                  </label>
                  <select
                    id="delivery-saved-address"
                    value={selectedAddressId}
                    onChange={(event) => selectSavedAddress(event.target.value)}
                    disabled={savedAddressesLoading || !savedAddresses.length}
                  >
                    <option value="">Ingresar dirección manualmente</option>
                    {savedAddresses.map((saved) => (
                      <option key={saved.addressId} value={saved.addressId}>
                        {saved.label}
                        {saved.isDefault ? " · Predeterminada" : ""}
                      </option>
                    ))}
                  </select>
                  {savedAddressesLoading ? (
                    <small>Cargando direcciones guardadas…</small>
                  ) : null}
                  {savedAddressesError ? (
                    <small>
                      No pudimos cargar tus direcciones. Puedes ingresar una
                      dirección manualmente.
                    </small>
                  ) : null}
                  <FormField
                    id="delivery-reference"
                    label="Referencia (opcional)"
                    maxLength={300}
                    value={reference}
                    onChange={(e) => {
                      addressFieldsEdited.current = true;
                      addressFields.current.reference = e.target.value;
                      setSelectedAddressId("");
                      setReference(e.target.value);
                    }}
                  />
                  <FormField
                    id="delivery-phone"
                    label="Teléfono de contacto"
                    type="tel"
                    required
                    minLength={7}
                    maxLength={32}
                    value={phone}
                    onChange={(e) => {
                      addressFieldsEdited.current = true;
                      addressFields.current.phone = e.target.value;
                      setSelectedAddressId("");
                      setPhone(e.target.value);
                    }}
                  />
                  <label htmlFor="delivery-payment">Preferencia de pago</label>
                  <select
                    id="delivery-payment"
                    value={payment}
                    onChange={(e) =>
                      setPayment(
                        e.target.value as DeliveryRequest["paymentPreference"],
                      )
                    }
                  >
                    <option value="CASH_ON_DELIVERY">
                      Efectivo al recibir
                    </option>
                    <option value="ONLINE_PAYMENT_REQUESTED">
                      Solicitar pago en línea (pendiente de coordinación)
                    </option>
                  </select>
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
              <p>
                El restaurante confirmará cobertura, horario y cualquier costo
                de envío. La preferencia de pago no realiza un cobro.
              </p>
              <Button
                fullWidth
                type="submit"
                disabled={busy || (!attempt && !ready)}
              >
                {busy
                  ? "Enviando solicitud…"
                  : attempt
                    ? "Reintentar la misma solicitud"
                    : "Enviar solicitud de delivery"}
              </Button>
            </form>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {needsLogin && (
        <Link href="/login?next=%2Fclient%2Fdelivery">
          Iniciar sesión y recuperar la solicitud
        </Link>
      )}
    </div>
  );
}
