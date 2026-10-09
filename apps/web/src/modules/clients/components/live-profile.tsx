"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import { useClientPickupResource } from "@/modules/client-order-tracking/use-client-pickup-resource";
import { useClientIdentity } from "../use-client-identity";
import { createClientOperation } from "../client-identity-store";
import {
  isClientProfile,
  parseProfileUpdate,
  type ClientProfile,
  type ProfileUpdate,
} from "../profile-contract";
import styles from "@/modules/checkout/components/checkout.module.css";

export function LiveProfile({ userId }: { userId: string }) {
  const { identity, verified, refresh } = useClientIdentity(userId);
  const resource = useClientPickupResource(
    "/bff/profile",
    isClientProfile,
    userId,
    0,
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
