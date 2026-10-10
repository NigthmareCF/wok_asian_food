"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import {
  isClientProfile,
  type ClientProfile,
  type UpdateProfile,
} from "../client-contract";
import {
  isClientAddress,
  isClientAddressList,
  type ClientAddress,
  type CreateClientAddress,
} from "../address-contract";
import { isClientSessionList, type ClientSession } from "../session-contract";

type ProfileError = Error & { status?: number };

function responseMessage(status: number) {
  if (status === 401) return "Tu sesión expiró. Inicia sesión nuevamente.";
  if (status === 409)
    return "Tus datos cambiaron en otra sesión. Recargamos la información; revisa y vuelve a guardar.";
  return "No pudimos cargar tu perfil. Intenta nuevamente.";
}

async function readProfile(signal?: AbortSignal): Promise<ClientProfile> {
  let response: Response;
  try {
    response = await fetch("/bff/client/profile", {
      cache: "no-store",
      signal,
    });
  } catch {
    throw Object.assign(
      new Error("No pudimos cargar tu perfil. Intenta nuevamente."),
      { status: 503 },
    ) as ProfileError;
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isClientProfile(body)) {
    throw Object.assign(new Error(responseMessage(response.status)), {
      status: response.status,
    }) as ProfileError;
  }
  return body;
}

async function updateProfile(payload: UpdateProfile): Promise<ClientProfile> {
  let response: Response;
  try {
    response = await fetch("/bff/client/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw Object.assign(
      new Error("No pudimos guardar tu perfil. Intenta nuevamente."),
      { status: 503 },
    ) as ProfileError;
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isClientProfile(body)) {
    throw Object.assign(
      new Error(
        response.status === 409
          ? responseMessage(409)
          : response.status === 401
            ? responseMessage(401)
            : "No pudimos guardar tu perfil. Intenta nuevamente.",
      ),
      { status: response.status },
    ) as ProfileError;
  }
  return body;
}

type AddressError = Error & { status?: number };
type AddressDraft = CreateClientAddress;
const emptyAddress: AddressDraft = {
  label: "",
  address: "",
  reference: "",
  contactPhone: "",
  isDefault: false,
};

async function readAddresses(signal?: AbortSignal): Promise<ClientAddress[]> {
  let response: Response;
  try {
    response = await fetch("/bff/client/addresses", {
      cache: "no-store",
      signal,
    });
  } catch {
    throw Object.assign(new Error("No pudimos cargar tus direcciones."), {
      status: 503,
    }) as AddressError;
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isClientAddressList(body)) {
    throw Object.assign(
      new Error(
        response.status === 401
          ? "Tu sesión expiró. Inicia sesión nuevamente."
          : response.status === 404
            ? "No encontramos tus direcciones."
            : "No pudimos cargar tus direcciones.",
      ),
      { status: response.status },
    ) as AddressError;
  }
  return body;
}

async function saveAddress(
  addressId: string | null,
  payload: AddressDraft,
  expectedVersion?: number,
): Promise<ClientAddress> {
  const response = await fetch(
    addressId
      ? `/bff/client/addresses/${encodeURIComponent(addressId)}`
      : "/bff/client/addresses",
    {
      method: addressId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        addressId ? { ...payload, expectedVersion } : payload,
      ),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isClientAddress(body)) {
    throw Object.assign(
      new Error(
        response.status === 401
          ? "Tu sesión expiró. Inicia sesión nuevamente."
          : response.status === 404
            ? "No encontramos esa dirección."
            : response.status === 409
              ? "La dirección cambió. Actualiza e inténtalo de nuevo."
              : "No se pudo guardar la dirección.",
      ),
      { status: response.status },
    ) as AddressError;
  }
  return body;
}

async function deleteAddress(addressId: string) {
  const response = await fetch(
    `/bff/client/addresses/${encodeURIComponent(addressId)}`,
    { method: "DELETE" },
  );
  if (!response.ok)
    throw Object.assign(
      new Error(
        response.status === 401
          ? "Tu sesión expiró. Inicia sesión nuevamente."
          : response.status === 404
            ? "No encontramos esa dirección."
            : response.status === 409
              ? "La dirección cambió. Actualiza e inténtalo de nuevo."
              : "No se pudo eliminar la dirección.",
      ),
      { status: response.status },
    ) as AddressError;
}

type SessionError = Error & { status?: number };

async function readSessions(signal?: AbortSignal): Promise<ClientSession[]> {
  let response: Response;
  try {
    response = await fetch("/bff/client/sessions", {
      cache: "no-store",
      signal,
    });
  } catch {
    throw Object.assign(new Error("No pudimos cargar tus sesiones activas."), {
      status: 503,
    }) as SessionError;
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isClientSessionList(body)) {
    throw Object.assign(
      new Error(
        response.status === 401
          ? "Tu sesión expiró. Inicia sesión nuevamente."
          : response.status === 404
            ? "No encontramos tus sesiones activas."
            : "No pudimos cargar tus sesiones activas.",
      ),
      { status: response.status },
    ) as SessionError;
  }
  return body;
}

async function revokeSession(sessionId: string) {
  const response = await fetch(
    `/bff/client/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );
  if (!response.ok)
    throw Object.assign(
      new Error(
        response.status === 401
          ? "Tu sesión expiró. Inicia sesión nuevamente."
          : response.status === 404
            ? "No encontramos esa sesión."
            : "No se pudo revocar la sesión.",
      ),
      { status: response.status },
    ) as SessionError;
}

export function ClientProfileView() {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [error, setError] = useState<ProfileError | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [addresses, setAddresses] = useState<ClientAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [addressError, setAddressError] = useState<AddressError | null>(null);
  const [addressNotice, setAddressNotice] = useState("");
  const [addressDraft, setAddressDraft] = useState<AddressDraft>(emptyAddress);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(
    null,
  );
  const [addressSaving, setAddressSaving] = useState(false);
  const addressSavingRef = useRef(false);
  const [sessions, setSessions] = useState<ClientSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionError, setSessionError] = useState<SessionError | null>(null);
  const [sessionNotice, setSessionNotice] = useState("");
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(
    null,
  );
  const [sessionSaving, setSessionSaving] = useState(false);
  const sessionSavingRef = useRef(false);

  const applyProfile = useCallback((next: ClientProfile) => {
    setProfile(next);
    setDisplayName(next.displayName);
    setPhone(next.phone ?? "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applyProfile(await readProfile());
    } catch (cause) {
      setError(cause as ProfileError);
    } finally {
      setLoading(false);
    }
  }, [applyProfile]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialProfile() {
      try {
        const next = await readProfile(controller.signal);
        if (!controller.signal.aborted) applyProfile(next);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause as ProfileError);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadInitialProfile();
    return () => controller.abort();
  }, [applyProfile]);

  const loadAddresses = useCallback(async () => {
    setAddressesLoading(true);
    setAddressError(null);
    try {
      setAddresses(await readAddresses());
    } catch (cause) {
      setAddressError(cause as AddressError);
    } finally {
      setAddressesLoading(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionError(null);
    try {
      setSessions(await readSessions());
    } catch (cause) {
      setSessionError(cause as SessionError);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadInitialSessions() {
      try {
        const next = await readSessions(controller.signal);
        if (!controller.signal.aborted) setSessions(next);
      } catch (cause) {
        if (!controller.signal.aborted) setSessionError(cause as SessionError);
      } finally {
        if (!controller.signal.aborted) setSessionsLoading(false);
      }
    }
    void loadInitialSessions();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadInitialAddresses() {
      try {
        const next = await readAddresses(controller.signal);
        if (!controller.signal.aborted) setAddresses(next);
      } catch (cause) {
        if (!controller.signal.aborted) setAddressError(cause as AddressError);
      } finally {
        if (!controller.signal.aborted) setAddressesLoading(false);
      }
    }
    void loadInitialAddresses();
    return () => controller.abort();
  }, []);

  function beginAddress(address?: ClientAddress) {
    setEditingAddressId(address?.addressId ?? null);
    setDeletingAddressId(null);
    setAddressDraft(
      address
        ? {
            label: address.label,
            address: address.address,
            reference: address.reference ?? "",
            contactPhone: address.contactPhone,
            isDefault: address.isDefault,
          }
        : { ...emptyAddress, isDefault: addresses.length === 0 },
    );
    setAddressError(null);
    setAddressNotice("");
  }

  function cancelAddress() {
    setEditingAddressId(null);
    setAddressDraft(emptyAddress);
    setAddressError(null);
  }

  async function submitAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (addressSavingRef.current) return;
    const payload = {
      ...addressDraft,
      label: addressDraft.label.trim(),
      address: addressDraft.address.trim(),
      reference: addressDraft.reference.trim(),
      contactPhone: addressDraft.contactPhone.trim(),
    };
    if (
      payload.label.length < 1 ||
      payload.label.length > 80 ||
      payload.address.length < 5 ||
      payload.address.length > 500 ||
      payload.reference.length > 300 ||
      !/^[0-9+() .-]{7,32}$/.test(payload.contactPhone)
    ) {
      setAddressError(
        Object.assign(new Error("Revisa los campos de la dirección."), {
          status: 400,
        }),
      );
      return;
    }
    addressSavingRef.current = true;
    setAddressSaving(true);
    setAddressError(null);
    setAddressNotice("");
    try {
      const current = addresses.find(
        (address) => address.addressId === editingAddressId,
      );
      const saved = await saveAddress(
        editingAddressId,
        payload,
        current?.version,
      );
      setAddresses((items) =>
        editingAddressId
          ? items.map((item) =>
              item.addressId === saved.addressId
                ? saved
                : saved.isDefault
                  ? { ...item, isDefault: false }
                  : item,
            )
          : [
              saved,
              ...items.map((item) =>
                saved.isDefault ? { ...item, isDefault: false } : item,
              ),
            ],
      );
      setEditingAddressId(null);
      setAddressDraft(emptyAddress);
      setAddressNotice("La dirección se guardó en tu cuenta.");
    } catch (cause) {
      setAddressError(cause as AddressError);
    } finally {
      addressSavingRef.current = false;
      setAddressSaving(false);
    }
  }

  async function confirmDeleteAddress(addressId: string) {
    if (addressSavingRef.current) return;
    addressSavingRef.current = true;
    setAddressSaving(true);
    setAddressError(null);
    setAddressNotice("");
    try {
      await deleteAddress(addressId);
      setAddresses((items) =>
        items.filter((item) => item.addressId !== addressId),
      );
      setDeletingAddressId(null);
      setAddressNotice("La dirección se eliminó de tu cuenta.");
    } catch (cause) {
      setAddressError(cause as AddressError);
    } finally {
      addressSavingRef.current = false;
      setAddressSaving(false);
    }
  }

  async function confirmRevokeSession(sessionId: string) {
    if (sessionSavingRef.current) return;
    sessionSavingRef.current = true;
    setSessionSaving(true);
    setSessionError(null);
    setSessionNotice("");
    setRevokingSessionId(sessionId);
    try {
      await revokeSession(sessionId);
      await loadSessions();
      setSessionNotice("La sesión se revocó correctamente.");
    } catch (cause) {
      setSessionError(cause as SessionError);
    } finally {
      sessionSavingRef.current = false;
      setSessionSaving(false);
      setRevokingSessionId(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || savingRef.current) return;
    const name = displayName.trim();
    const normalizedPhone = phone.trim();
    if (name.length < 2 || name.length > 100) {
      setNameError("Escribe un nombre de 2 a 100 caracteres.");
      return;
    }
    setNameError("");
    if (normalizedPhone && !/^[+0-9() .-]{7,25}$/.test(normalizedPhone)) {
      setPhoneError("Escribe un teléfono válido o déjalo vacío.");
      return;
    }
    setPhoneError("");
    setError(null);
    setNotice("");
    savingRef.current = true;
    setSaving(true);
    try {
      const next = await updateProfile({
        displayName: name,
        phone: normalizedPhone,
        expectedVersion: profile.version,
      });
      applyProfile(next);
      setNotice("Perfil guardado.");
    } catch (cause) {
      const profileError = cause as ProfileError;
      setError(profileError);
      if (profileError.status === 409) {
        await load();
        setError(profileError);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (loading) return <p role="status">Cargando tu perfil…</p>;

  if (error && !profile)
    return (
      <section className="panel" aria-labelledby="profile-error-title">
        <h1 id="profile-error-title">Perfil</h1>
        <p className="form-feedback form-feedback--error" role="alert">
          {error.message}
        </p>
        {error.status === 401 ? (
          <Link
            className="button button--primary"
            href="/login?next=%2Fclient%2Fprofile"
          >
            Iniciar sesión
          </Link>
        ) : (
          <Button onClick={() => void load()}>Reintentar</Button>
        )}
      </section>
    );

  if (!profile) return null;

  return (
    <section aria-labelledby="client-profile-title">
      <header className="page-header">
        <div>
          <span className="eyebrow">CUENTA CLIENTE</span>
          <h1 id="client-profile-title">Perfil</h1>
          <p>Consulta tus datos y actualiza la información permitida.</p>
        </div>
      </header>
      <div className="panel form-stack">
        <div>
          <strong>Identificador</strong>
          <p>{profile.userId}</p>
        </div>
        <div>
          <strong>Correo electrónico</strong>
          <p>{profile.email}</p>
        </div>
        <form className="form-stack" onSubmit={submit} noValidate>
          <FormField
            id="client-profile-display-name"
            label="Nombre visible"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            error={nameError || undefined}
            disabled={saving}
            autoComplete="name"
          />
          <FormField
            id="client-profile-phone"
            label="Teléfono"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            error={phoneError || undefined}
            disabled={saving}
            autoComplete="tel"
          />
          <p>Versión de datos: {profile.version}</p>
          {error ? (
            <div>
              <p className="form-feedback form-feedback--error" role="alert">
                {error.message}
              </p>
              {error.status === 401 ? (
                <Link href="/login?next=%2Fclient%2Fprofile">
                  Iniciar sesión nuevamente
                </Link>
              ) : null}
            </div>
          ) : null}
          {notice ? (
            <p className="form-feedback" role="status">
              {notice}
            </p>
          ) : null}
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </form>
      </div>
      <section
        className="panel form-stack"
        aria-labelledby="client-addresses-title"
      >
        <div className="page-header">
          <div>
            <h2 id="client-addresses-title">Direcciones guardadas</h2>
            <p>Administra las direcciones asociadas a tu cuenta.</p>
          </div>
          <Button
            type="button"
            onClick={() => beginAddress()}
            disabled={addressSaving || editingAddressId !== null}
          >
            Agregar dirección
          </Button>
        </div>
        {addressError ? (
          <div>
            <p className="form-feedback form-feedback--error" role="alert">
              {addressError.message}
            </p>
            {addressError.status === 401 ? (
              <Link href="/login?next=%2Fclient%2Fprofile">
                Iniciar sesión nuevamente
              </Link>
            ) : null}
          </div>
        ) : null}
        {addressNotice ? (
          <p className="form-feedback" role="status">
            {addressNotice}
          </p>
        ) : null}
        {addressesLoading ? (
          <p role="status">Cargando tus direcciones…</p>
        ) : null}
        {!addressesLoading && addresses.length === 0 ? (
          <p>Aún no tienes direcciones guardadas.</p>
        ) : null}
        {!addressesLoading
          ? addresses.map((address) => (
              <article key={address.addressId} className="form-stack">
                <div>
                  <strong>
                    {address.label}
                    {address.isDefault ? " · Predeterminada" : ""}
                  </strong>
                  <p>{address.address}</p>
                  {address.reference ? (
                    <p>Referencia: {address.reference}</p>
                  ) : null}
                  <p>Teléfono: {address.contactPhone}</p>
                </div>
                {deletingAddressId === address.addressId ? (
                  <div>
                    <p>
                      ¿Eliminar esta dirección guardada? Esta acción no se puede
                      deshacer.
                    </p>
                    <Button
                      type="button"
                      onClick={() =>
                        void confirmDeleteAddress(address.addressId)
                      }
                      disabled={addressSaving}
                    >
                      Sí, eliminar dirección
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setDeletingAddressId(null)}
                      disabled={addressSaving}
                    >
                      Conservar dirección
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Button type="button" onClick={() => beginAddress(address)}>
                      Editar dirección
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        setDeletingAddressId(address.addressId);
                        setEditingAddressId(null);
                      }}
                    >
                      Eliminar dirección
                    </Button>
                  </div>
                )}
              </article>
            ))
          : null}
        {!addressesLoading ? (
          <Button
            type="button"
            onClick={() => void loadAddresses()}
            disabled={addressSaving}
          >
            Actualizar lista
          </Button>
        ) : null}
        {editingAddressId !== null ||
        (addressDraft === emptyAddress ? false : true) ? (
          <form className="form-stack" onSubmit={submitAddress} noValidate>
            <h3>{editingAddressId ? "Editar dirección" : "Nueva dirección"}</h3>
            <FormField
              id="client-address-label"
              label="Nombre"
              value={addressDraft.label}
              onChange={(event) =>
                setAddressDraft((current) => ({
                  ...current,
                  label: event.target.value,
                }))
              }
              disabled={addressSaving}
              autoComplete="address-line1"
            />
            <FormField
              id="client-address-value"
              label="Dirección completa"
              value={addressDraft.address}
              onChange={(event) =>
                setAddressDraft((current) => ({
                  ...current,
                  address: event.target.value,
                }))
              }
              disabled={addressSaving}
              autoComplete="street-address"
            />
            <FormField
              id="client-address-reference"
              label="Referencia (opcional)"
              value={addressDraft.reference}
              onChange={(event) =>
                setAddressDraft((current) => ({
                  ...current,
                  reference: event.target.value,
                }))
              }
              disabled={addressSaving}
            />
            <FormField
              id="client-address-phone"
              label="Teléfono de contacto"
              value={addressDraft.contactPhone}
              onChange={(event) =>
                setAddressDraft((current) => ({
                  ...current,
                  contactPhone: event.target.value,
                }))
              }
              disabled={addressSaving}
              autoComplete="tel"
            />
            <label>
              <input
                type="checkbox"
                checked={addressDraft.isDefault}
                onChange={(event) =>
                  setAddressDraft((current) => ({
                    ...current,
                    isDefault: event.target.checked,
                  }))
                }
                disabled={addressSaving}
              />{" "}
              Usar como dirección predeterminada
            </label>
            <div>
              <Button type="submit" disabled={addressSaving}>
                Guardar dirección
              </Button>
              <Button
                type="button"
                onClick={cancelAddress}
                disabled={addressSaving}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}
      </section>
      <section
        className="panel form-stack"
        aria-labelledby="client-sessions-title"
      >
        <div className="page-header">
          <div>
            <h2 id="client-sessions-title">Sesiones activas</h2>
            <p>
              Consulta dónde está abierta tu cuenta y revoca otras sesiones.
            </p>
          </div>
        </div>
        {sessionError ? (
          <div>
            <p className="form-feedback form-feedback--error" role="alert">
              {sessionError.message}
            </p>
            {sessionError.status === 401 ? (
              <Link href="/login?next=%2Fclient%2Fprofile">
                Iniciar sesión nuevamente
              </Link>
            ) : null}
          </div>
        ) : null}
        {sessionNotice ? (
          <p className="form-feedback" role="status">
            {sessionNotice}
          </p>
        ) : null}
        {sessionsLoading ? (
          <p role="status">Cargando tus sesiones activas…</p>
        ) : null}
        {!sessionsLoading && sessions.length === 0 ? (
          <p>No hay sesiones activas disponibles.</p>
        ) : null}
        {!sessionsLoading
          ? sessions.map((session) => (
              <article key={session.sessionId} className="form-stack">
                <div>
                  <strong>
                    {session.deviceName || sessionTypeLabel(session.clientType)}
                    {session.current ? " · Sesión actual" : ""}
                  </strong>
                  <p>Tipo: {sessionTypeLabel(session.clientType)}</p>
                  <p>Creada: {formatSessionDate(session.createdAt)}</p>
                  <p>
                    Última actividad:{" "}
                    {formatSessionDate(session.lastActivityAt)}
                  </p>
                </div>
                {session.current ? (
                  <p>Esta sesión se cierra desde el botón de cierre normal.</p>
                ) : revokingSessionId === session.sessionId ? (
                  <div>
                    <p>
                      ¿Revocar esta sesión? Tendrás que iniciar sesión
                      nuevamente en ese dispositivo.
                    </p>
                    <Button
                      type="button"
                      onClick={() =>
                        void confirmRevokeSession(session.sessionId)
                      }
                      disabled={sessionSaving}
                    >
                      Sí, revocar sesión
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setRevokingSessionId(null)}
                      disabled={sessionSaving}
                    >
                      Conservar sesión
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    onClick={() => setRevokingSessionId(session.sessionId)}
                    disabled={sessionSaving}
                  >
                    Revocar sesión
                  </Button>
                )}
              </article>
            ))
          : null}
        {!sessionsLoading ? (
          <Button
            type="button"
            onClick={() => void loadSessions()}
            disabled={sessionSaving}
          >
            Actualizar sesiones
          </Button>
        ) : null}
      </section>
    </section>
  );
}

function sessionTypeLabel(clientType: ClientSession["clientType"]) {
  return clientType === "MOBILE"
    ? "Aplicación móvil"
    : clientType === "WEB"
      ? "Navegador web"
      : "Dispositivo de escritorio";
}

function formatSessionDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No disponible"
    : date.toLocaleString("es-GT", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}
