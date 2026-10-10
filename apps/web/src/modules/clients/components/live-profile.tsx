"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import { useClientPickupResource } from "@/modules/client-order-tracking/use-client-pickup-resource";
import { useClientIdentity } from "../use-client-identity";
import { createClientOperation, type ClientIdentity } from "../client-identity-store";
import {
  isClientProfile,
  parseProfileUpdate,
  type ClientProfile,
  type ProfileUpdate,
} from "../profile-contract";
import {
  isClientAddressList,
  type ClientAddress,
} from "@/modules/profile/address-contract";
import {
  isClientSessionList,
  type ClientSession,
} from "@/modules/profile/session-contract";
import styles from "@/modules/checkout/components/checkout.module.css";

export function LiveProfile({ userId }: { userId: string }) {
  const { identity, verified, refresh } = useClientIdentity(userId);
  const resource = useClientPickupResource(
    "/bff/profile",
    isClientProfile,
    userId,
    0,
  );
  const addresses = useClientPickupResource(
    "/bff/client/addresses",
    isClientAddressList,
    userId,
    30_000,
  );
  const sessions = useClientPickupResource(
    "/bff/client/sessions",
    isClientSessionList,
    userId,
    30_000,
  );
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function save(payload: ProfileUpdate) {
    if (lock.current || !verified) return;
    if (!parseProfileUpdate(payload)) {
      setFeedback("Revisa el nombre y el teléfono antes de guardar.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setFeedback("");
    const operation = createClientOperation(identity);
    try {
      if (!(await operation.confirm())) return;
      const response = await fetch("/bff/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Wok-Expected-Principal": userId,
        },
        body: JSON.stringify(payload),
        signal: operation.signal,
      });
      const body: unknown = await response.json();
      if (!(await operation.confirm())) return;
      if (
        !response.ok ||
        !isClientProfile(body) ||
        body.userId !== userId ||
        body.version !== payload.expectedVersion + 1
      ) {
        setFeedback(
          response.status === 409
            ? "El perfil cambió. Consulta los datos actuales antes de guardar otra vez."
            : "No pudimos confirmar el cambio. Consulta el perfil actualizado antes de reintentar.",
        );
      } else setFeedback("Perfil guardado en el restaurante.");
    } catch {
      if (operation.valid())
        setFeedback(
          "El resultado es incierto. Consulta los datos actuales antes de guardar otra vez.",
        );
    } finally {
      operation.dispose();
      lock.current = false;
      setBusy(false);
      resource.reload();
    }
  }
  return (
    <div className={styles.checkout}>
      <h1>Mi perfil</h1>
      {!verified ? (
        <>
          <p role="status">Verifica tu sesión para consultar el perfil.</p>
          <Button onClick={() => void refresh()}>Verificar sesión</Button>
        </>
      ) : (
        <>
          {feedback && <p role="status">{feedback}</p>}
          {resource.error ? (
            <p role="alert">{resource.error.message}</p>
          ) : resource.data?.userId === userId ? (
            <ProfileForm
              key={`${userId}:${resource.data.version}`}
              profile={resource.data}
              busy={busy}
              save={save}
            />
          ) : (
            <p role="status">Consultando perfil…</p>
          )}
          <AddressBook
            addresses={Array.isArray(addresses.data) ? addresses.data : []}
            error={addresses.error?.message}
            reload={addresses.reload}
            userId={userId}
            verified={verified}
            identity={identity}
          />
          <SessionList
            sessions={Array.isArray(sessions.data) ? sessions.data : []}
            error={sessions.error?.message}
            reload={sessions.reload}
            userId={userId}
            verified={verified}
            identity={identity}
          />
          <Button variant="secondary" disabled={busy} onClick={resource.reload}>
            Consultar datos actuales
          </Button>
        </>
      )}
      <nav aria-label="Accesos de perfil">
        <Link href="/client/orders">Mis pedidos</Link>
        {" · "}
        <Link href="/client/reservations/new">Mis reservas</Link>
        {" · "}
        <Link href="/client/messages">Mensajes</Link>
        {" · "}
        <Link href="/client/delivery">Delivery</Link>
        {" · "}
        <Link href="/location">Ubicación</Link>
      </nav>
    </div>
  );
}
function ProfileForm({
  profile,
  busy,
  save,
}: {
  profile: ClientProfile;
  busy: boolean;
  save: (payload: ProfileUpdate) => Promise<void>;
}) {
  const [name, setName] = useState(profile.displayName);
  const [phone, setPhone] = useState(profile.phone ?? "");
  function submit(event: FormEvent) {
    event.preventDefault();
    void save({ displayName: name, phone, expectedVersion: profile.version });
  }
  return (
    <form className={styles.card} onSubmit={submit}>
      <p>Correo: {profile.email}</p>
      <FormField
        id="profile-name"
        label="Nombre"
        required
        minLength={2}
        maxLength={100}
        value={name}
        disabled={busy}
        onChange={(event) => setName(event.target.value)}
      />
      <FormField
        id="profile-phone"
        label="Teléfono (opcional)"
        type="tel"
        pattern="^$|^[+0-9() .\-]{7,25}$"
        maxLength={25}
        value={phone}
        disabled={busy}
        onChange={(event) => setPhone(event.target.value)}
      />
      <Button type="submit" disabled={busy}>
        {busy ? "Guardando…" : "Guardar perfil"}
      </Button>
    </form>
  );
}

type AddressBookProps = {
  addresses: ClientAddress[];
  error?: string;
  reload: () => void;
  userId: string;
  verified: boolean;
  identity: ClientIdentity;
};

function AddressBook({
  addresses,
  error,
  reload,
  userId,
  verified,
  identity,
}: AddressBookProps) {
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [reference, setReference] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  async function mutate(
    url: string,
    method: "POST" | "PUT" | "DELETE",
    body?: Record<string, unknown>,
  ) {
    if (!verified || busy) return;
    setBusy(true);
    setFeedback("");
    const operation = createClientOperation(identity);
    try {
      if (!(await operation.confirm())) return;
      const response = await fetch(url, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          "X-Wok-Expected-Principal": userId,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: operation.signal,
      });
      if (!(await operation.confirm())) return;
      if (!response.ok) {
        setFeedback(
          response.status === 409
            ? "La dirección cambió. Consulta la libreta y vuelve a intentar."
            : "No se pudo actualizar la libreta.",
        );
        return;
      }
      if (method === "POST") {
        setLabel("");
        setAddress("");
        setReference("");
        setContactPhone("");
        setIsDefault(false);
      }
      reload();
    } catch {
      if (operation.valid()) setFeedback("No se pudo actualizar la libreta.");
    } finally {
      operation.dispose();
      setBusy(false);
    }
  }

  function createAddress(event: FormEvent) {
    event.preventDefault();
    void mutate("/bff/client/addresses", "POST", {
      label,
      address,
      reference,
      contactPhone,
      isDefault,
    });
  }

  return (
    <section className={styles.card} aria-labelledby="address-book-title">
      <h2 id="address-book-title">Libreta de direcciones</h2>
      {error && <p role="alert">{error}</p>}
      {feedback && <p role="status">{feedback}</p>}
      {addresses.length ? (
        <ul>
          {addresses.map((item) => (
            <li key={item.addressId}>
              <strong>{item.label}</strong>
              {item.isDefault && <span> · Predeterminada</span>}
              <p>{item.address}</p>
              {item.reference && <p>Referencia: {item.reference}</p>}
              <p>Teléfono: {item.contactPhone}</p>
              {!item.isDefault && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void mutate(`/bff/client/addresses/${item.addressId}`, "PUT", {
                      label: item.label,
                      address: item.address,
                      reference: item.reference ?? "",
                      contactPhone: item.contactPhone,
                      isDefault: true,
                      expectedVersion: item.version,
                    })
                  }
                >
                  Usar como predeterminada
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                disabled={busy || item.isDefault}
                onClick={() =>
                  void mutate(`/bff/client/addresses/${item.addressId}`, "DELETE")
                }
              >
                Eliminar
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p>Aún no tienes direcciones guardadas.</p>
      )}
      <form onSubmit={createAddress}>
        <h3>Agregar dirección</h3>
        <FormField id="address-label" label="Etiqueta" required value={label} onChange={(event) => setLabel(event.target.value)} />
        <FormField id="address-value" label="Dirección" required value={address} onChange={(event) => setAddress(event.target.value)} />
        <FormField id="address-reference" label="Referencia (opcional)" value={reference} onChange={(event) => setReference(event.target.value)} />
        <FormField id="address-phone" label="Teléfono" type="tel" required value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
        <label>
          <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />{" "}
          Usar como predeterminada
        </label>
        <Button type="submit" disabled={busy}>Guardar dirección</Button>
      </form>
    </section>
  );
}

function SessionList({
  sessions,
  error,
  reload,
  userId,
  verified,
  identity,
}: {
  sessions: ClientSession[];
  error?: string;
  reload: () => void;
  userId: string;
  verified: boolean;
  identity: ClientIdentity;
}) {
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  async function revoke(session: ClientSession) {
    if (!verified || session.current || busy) return;
    setBusy(true);
    setFeedback("");
    const operation = createClientOperation(identity);
    try {
      if (!(await operation.confirm())) return;
      const response = await fetch(`/bff/client/sessions/${session.sessionId}`, {
        method: "DELETE",
        headers: { "X-Wok-Expected-Principal": userId },
        signal: operation.signal,
      });
      if (!(await operation.confirm())) return;
      if (!response.ok) setFeedback("No se pudo cerrar esa sesión.");
      else reload();
    } catch {
      if (operation.valid()) setFeedback("No se pudo cerrar esa sesión.");
    } finally {
      operation.dispose();
      setBusy(false);
    }
  }
  return (
    <section className={styles.card} aria-labelledby="sessions-title">
      <h2 id="sessions-title">Sesiones activas</h2>
      {error && <p role="alert">{error}</p>}
      {feedback && <p role="status">{feedback}</p>}
      <ul>
        {sessions.map((session) => (
          <li key={session.sessionId}>
            <strong>{session.deviceName ?? session.clientType}</strong>
            {session.current ? " · Sesión actual" : ""}
            <p>Última actividad: {new Date(session.lastActivityAt).toLocaleString("es-GT")}</p>
            {!session.current && (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void revoke(session)}>
                Revocar sesión
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
