"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import { useClientPickupResource } from "@/modules/client-order-tracking/use-client-pickup-resource";
import {
  isClientAddress,
  isClientAddressList,
  parseCreateClientAddress,
  type ClientAddress,
  type CreateClientAddress,
} from "@/modules/profile/address-contract";
import { isClientSessionList } from "@/modules/profile/session-contract";
import { useClientIdentity } from "../use-client-identity";
import { createClientOperation } from "../client-identity-store";
import styles from "@/modules/checkout/components/checkout.module.css";

export function ProfileResources({ userId }: { userId: string }) {
  const { identity, verified, refresh } = useClientIdentity(userId);
  const addresses = useClientPickupResource(
    "/bff/client/addresses",
    isClientAddressList,
    userId,
    0,
  );
  const sessions = useClientPickupResource(
    "/bff/client/sessions",
    isClientSessionList,
    userId,
    0,
  );
  const [editing, setEditing] = useState<ClientAddress | null>(null);
  const [formRevision, setFormRevision] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  async function mutate(
    path: string,
    method: "POST" | "PUT" | "DELETE",
    payload?: unknown,
    currentSession = false,
  ) {
    if (lock.current || !verified) return;
    lock.current = true;
    setBusy(true);
    setFeedback("");
    const operation = createClientOperation(identity);
    try {
      if (!(await operation.confirm())) return;
      const response = await fetch(path, {
        method,
        headers: {
          "X-Wok-Expected-Principal": userId,
          ...(payload ? { "Content-Type": "application/json" } : {}),
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: operation.signal,
      });
      if (method === "DELETE") {
        if (response.status !== 204) throw new Error("Unconfirmed deletion");
        if (currentSession) {
          await refresh();
          return;
        }
      } else {
        const body: unknown = await response.json();
        if (!(await operation.confirm())) return;
        if (response.status === 409) {
          setFeedback(
            "Los datos cambiaron. Consulta las direcciones actuales antes de guardar de nuevo.",
          );
          setEditing(null);
          setFormRevision((value) => value + 1);
          return;
        }
        if (
          !response.ok ||
          !isClientAddress(body) ||
          (editing &&
            (body.addressId !== editing.addressId ||
              body.version !== editing.version + 1))
        )
          throw new Error("Unconfirmed address");
        setEditing(null);
        setFormRevision((value) => value + 1);
      }
      if (await operation.confirm())
        setFeedback("Cambio confirmado en el restaurante.");
    } catch {
      if (await operation.confirm())
        setFeedback(
          "No pudimos confirmar el cambio. Consulta los datos actuales antes de reintentar.",
        );
    } finally {
      operation.dispose();
      lock.current = false;
      setBusy(false);
      addresses.reload();
      sessions.reload();
    }
  }

  if (!verified) return null;
  return (
    <>
      {feedback && <p role="status">{feedback}</p>}
      <section className={styles.card} aria-label="Direcciones guardadas">
        <h2>Mis direcciones</h2>
        {addresses.error ? (
          <p role="alert">{addresses.error.message}</p>
        ) : addresses.data ? (
          <>
            {addresses.data.length === 0 && (
              <p>No tienes direcciones guardadas.</p>
            )}
            {addresses.data.map((address) => (
              <div key={address.addressId}>
                <h3>
                  {address.label}
                  {address.isDefault ? " · Predeterminada" : ""}
                </h3>
                <p>{address.address}</p>
                <p>{address.reference}</p>
                <p>{address.contactPhone}</p>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setEditing(address)}
                >
                  Editar {address.label}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      `/bff/client/addresses/${address.addressId}`,
                      "DELETE",
                    )
                  }
                >
                  Eliminar {address.label}
                </Button>
              </div>
            ))}
          </>
        ) : (
          <p role="status">Consultando direcciones…</p>
        )}
        <Button variant="secondary" disabled={busy} onClick={addresses.reload}>
          Consultar direcciones actuales
        </Button>
        <AddressForm
          key={`${editing?.addressId ?? "new"}:${editing?.version ?? 0}:${formRevision}`}
          address={editing}
          busy={busy}
          cancel={() => setEditing(null)}
          save={(payload) =>
            void mutate(
              editing
                ? `/bff/client/addresses/${editing.addressId}`
                : "/bff/client/addresses",
              editing ? "PUT" : "POST",
              editing
                ? { ...payload, expectedVersion: editing.version }
                : payload,
            )
          }
        />
      </section>
      <section className={styles.card} aria-label="Sesiones activas">
        <h2>Mis sesiones</h2>
        {sessions.error ? (
          <p role="alert">{sessions.error.message}</p>
        ) : sessions.data ? (
          <>
            {sessions.data.length === 0 && <p>No hay sesiones activas.</p>}
            {sessions.data.map((session) => (
              <div key={session.sessionId}>
                <p>
                  {session.deviceName ?? "Dispositivo sin nombre"} ·{" "}
                  {session.clientType}
                  {session.current ? " · Sesión actual" : ""}
                </p>
                <p>
                  Última actividad:{" "}
                  <time dateTime={session.lastActivityAt}>
                    {session.lastActivityAt}
                  </time>
                </p>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      `/bff/client/sessions/${session.sessionId}`,
                      "DELETE",
                      undefined,
                      session.current,
                    )
                  }
                >
                  {session.current
                    ? "Cerrar esta sesión"
                    : `Revocar sesión ${session.deviceName ?? session.clientType}`}
                </Button>
              </div>
            ))}
          </>
        ) : (
          <p role="status">Consultando sesiones…</p>
        )}
        <Button variant="secondary" disabled={busy} onClick={sessions.reload}>
          Consultar sesiones actuales
        </Button>
      </section>
    </>
  );
}

function AddressForm({
  address,
  busy,
  save,
  cancel,
}: {
  address: ClientAddress | null;
  busy: boolean;
  save: (value: CreateClientAddress) => void;
  cancel: () => void;
}) {
  const [label, setLabel] = useState(address?.label ?? "");
  const [location, setLocation] = useState(address?.address ?? "");
  const [reference, setReference] = useState(address?.reference ?? "");
  const [phone, setPhone] = useState(address?.contactPhone ?? "");
  const [isDefault, setDefault] = useState(address?.isDefault ?? false);
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = parseCreateClientAddress({
      label,
      address: location,
      reference,
      contactPhone: phone,
      isDefault,
    });
    if (!payload) {
      setError("Revisa los datos de la dirección.");
      return;
    }
    setError("");
    save(payload);
  }
  return (
    <form onSubmit={submit}>
      <h3>{address ? "Editar dirección" : "Nueva dirección"}</h3>
      {error && <p role="alert">{error}</p>}
      <FormField
        id="address-label"
        label="Nombre de dirección"
        required
        maxLength={80}
        value={label}
        disabled={busy}
        onChange={(event) => setLabel(event.target.value)}
      />
      <FormField
        id="address-location"
        label="Dirección"
        required
        minLength={5}
        maxLength={500}
        value={location}
        disabled={busy}
        onChange={(event) => setLocation(event.target.value)}
      />
      <FormField
        id="address-reference"
        label="Referencia (opcional)"
        maxLength={300}
        value={reference}
        disabled={busy}
        onChange={(event) => setReference(event.target.value)}
      />
      <FormField
        id="address-phone"
        label="Teléfono de contacto"
        type="tel"
        required
        maxLength={32}
        value={phone}
        disabled={busy}
        onChange={(event) => setPhone(event.target.value)}
      />
      <label>
        <input
          type="checkbox"
          checked={isDefault}
          disabled={busy}
          onChange={(event) => setDefault(event.target.checked)}
        />{" "}
        Dirección predeterminada
      </label>
      <Button type="submit" disabled={busy}>
        Guardar dirección
      </Button>
      {address && (
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={cancel}
        >
          Cancelar edición
        </Button>
      )}
    </form>
  );
}
