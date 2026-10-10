"use client";
import Link from "next/link";
import {QuotePanel} from "@/modules/consolidated-core/quote-panel";
import type {QuoteSelection} from "@/modules/consolidated-core/contract";
import {useLiveCart} from "@/modules/cart/live-cart-provider";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import { useClientPickupResource } from "@/modules/client-order-tracking/use-client-pickup-resource";
import { useClientIdentity } from "@/modules/clients/use-client-identity";
import { createClientOperation } from "@/modules/clients/client-identity-store";
import {
  nextReservationWindow,
  reservationInputToInstant,
} from "../reservation-window";
import { useSubmission } from "@/modules/client-workflows/use-submission";
import {
  parseReservation,
  isReservationResult,
  isReservationHistory,
  isReservationCancellation,
  reservationLabels,
} from "../live-contract";
import styles from "@/modules/checkout/components/checkout.module.css";
export function LiveReservations({ userId }: { userId: string }) {
  const { identity, verified, refresh } = useClientIdentity(userId);
  const history = useClientPickupResource(
    "/bff/reservations",
    isReservationHistory,
    userId,
  );
  const submission = useSubmission(
    `wok.reservation.attempt.v1:${userId}`,
    "/bff/reservations",
    parseReservation,
    isReservationResult,
    userId,
  );
  const cart=useLiveCart();
  const [preorder,setPreorder]=useState(false);
  const [selection,setSelection]=useState<QuoteSelection|null>(null);
  const [guests, setGuests] = useState(2),
    [date, setDate] = useState(() => nextReservationWindow().defaultValue),
    [notes, setNotes] = useState(""),
    [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null),
    [cancelling, setCancelling] = useState(false);
  const lock = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const time = reservationInputToInstant(date);
    if(!submission.attempt&&!selection){setError("Cotiza y acepta el resultado antes de continuar.");return;}
    if (!submission.attempt && !time) {
      setError(
        "Elige un horario entre 14:00 y 21:15 de Guatemala, con la anticipación mínima por comensales.",
      );
      return;
    }
    const result = await submission.send(
      submission.attempt?.payload ?? {
        guests,
        requestedAt: time!.toISOString(),
        preorder,
        items:selection!.items,
        quoteId:selection!.quoteId,
        notes,
      },
    );
    if (result) history.reload();
  }
  async function cancel(id: string) {
    if (lock.current || !verified) return;
    const operation = createClientOperation(identity);
    lock.current = true;
    setCancelling(true);
    setError("");
    try {
      if (!(await operation.confirm())) return;
      const response = await fetch(`/bff/reservations/${id}`, {
        method: "DELETE",
        headers: { "X-Wok-Expected-Principal": userId },
        signal: operation.signal,
      });
      const body = await response.json();
      if (!(await operation.confirm())) return;
      if (
        !response.ok ||
        !isReservationCancellation(body) ||
        body.reservationId !== id
      )
        throw new Error(
          response.status === 409
            ? "La reserva cambió de estado. Actualiza el historial; solo se cancelan solicitudes pendientes."
            : "No pudimos confirmar la cancelación. Consulta el historial antes de reintentar.",
        );
      setConfirm(null);
    } catch (e) {
      if (operation.valid())
        setError(e instanceof Error ? e.message : "No se pudo cancelar.");
    } finally {
      operation.dispose();
      lock.current = false;
      setCancelling(false);
      history.reload();
    }
  }
  const receipt = submission.attempt?.receipt;
  if (!verified)
    return (
      <div className={styles.checkout}>
        <h1>Reservas</h1>
        <p role="status">
          Verifica tu sesión para consultar o enviar reservas.
        </p>
        <Button onClick={() => void refresh()}>Verificar sesión</Button>
        <Link href="/login">Iniciar sesión</Link>
      </div>
    );
  return (
    <div className={styles.checkout}>
      <h1>Reservas</h1>
      <p>
        Solicita una mesa con la anticipación mínima por comensales, entre las
        21:15 de Guatemala. La disponibilidad requiere revisión del
        restaurante.
      </p>
      {receipt ? (
        <section className={styles.summary} aria-label="Resultado de reserva">
          <h2>
            {receipt.submitted ? "Solicitud registrada" : "Horario no aceptado"}
          </h2>
          <p>{receipt.message}</p>
          <p>
            Este es el resultado al enviar. Consulta el estado actual en el
            historial de abajo.
          </p>
          <p>Código: {receipt.requestId}</p>
          <Button onClick={submission.clear}>Preparar otra solicitud</Button>
        </section>
      ) : (
        <form className={styles.card} onSubmit={submit}>
          {submission.attempt ? (
            <p>
              Hay una solicitud guardada. Se reenviarán los mismos datos para
              recuperar su resultado sin duplicarla.
            </p>
          ) : (
            <>
              <FormField
                id="reservation-guests"
                label="Personas"
                type="number"
                required
                min={1}
                max={50}
                value={guests}
                onChange={(e) => setGuests(Number(e.target.value))}
              />
              <FormField
                id="reservation-time"
                label="Fecha y hora de la reserva"
                type="datetime-local"
                min={nextReservationWindow().min}
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                help="Horario de Guatemala. Se propone hoy o el siguiente día con un horario válido."
              />
              <label><input type="checkbox" checked={preorder} onChange={e=>setPreorder(e.target.checked)}/>Confirmo una preorden completa con los productos del carrito. Es obligatoria para llegar a las 21:15.</label>
              {preorder?<p>{cart.items.map(item=>item.quantity+" × "+item.name).join(", ")||"Agrega productos al carrito antes de cotizar la preorden."}</p>:null}
              <QuotePanel userId={userId} guests={guests} preorder={preorder} requestedFor={reservationInputToInstant(date)?.toISOString()??""} items={preorder?cart.items.map(item=>({menuItemId:item.productId,quantity:item.quantity})):[]} onSelection={setSelection}/>
              <FormField
                id="reservation-notes"
                label="Notas (opcional)"
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </>
          )}
          <Button type="submit" disabled={submission.busy}>
            {submission.busy
              ? "Enviando…"
              : submission.attempt
                ? "Reintentar la misma solicitud"
                : "Solicitar reserva"}
          </Button>
        </form>
      )}
      {(error || submission.error) && (
        <p role="alert">{error || submission.error}</p>
      )}
      <h2>Mis solicitudes de reserva</h2>
      <Button onClick={history.reload}>Actualizar reservas</Button>
      {history.error ? (
        <p role="alert">
          {history.error.message}{" "}
          <Link href="/login?next=%2Fclient%2Freservations%2Fnew">
            Iniciar sesión
          </Link>
        </p>
      ) : !history.data ? (
        <p role="status">Consultando reservas…</p>
      ) : history.data.length === 0 ? (
        <p>No tienes solicitudes de reserva.</p>
      ) : (
        history.data.map((item) => (
          <article className={styles.summary} key={item.requestId}>
            <h3>
              {item.reservationStatus
                ? (reservationLabels[item.reservationStatus] ??
                  item.reservationStatus)
                : "Solicitud no aceptada"}
            </h3>
            <p>
              {item.requestedAt
                ? new Date(item.requestedAt).toLocaleString("es-GT", {
                    timeZone: "America/Guatemala",
                  })
                : "Horario no disponible"}{" "}
              · {item.guests ?? "—"} personas
            </p>
            <p>
              {!item.reservationStatus || item.reservationStatus === "REQUESTED"
                ? item.message
                : `Estado actual: ${reservationLabels[item.reservationStatus] ?? item.reservationStatus}.`}
            </p>
            <small>Código: {item.requestId}</small>
            {item.reservationId &&
              item.reservationStatus === "REQUESTED" &&
              (confirm === item.reservationId ? (
                <div>
                  <p>¿Cancelar esta solicitud de reserva?</p>
                  <Button
                    disabled={cancelling}
                    onClick={() => void cancel(item.reservationId!)}
                  >
                    Confirmar cancelación
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={cancelling}
                    onClick={() => setConfirm(null)}
                  >
                    Conservar reserva
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setConfirm(item.reservationId!)}>
                  Cancelar solicitud
                </Button>
              ))}
          </article>
        ))
      )}
    </div>
  );
}
