import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, Field, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { ApiError, CustomerTaxProfile } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

type Draft = { label: string; customerName: string; customerTaxId: string; isDefault: boolean };
const emptyDraft: Draft = { label: "", customerName: "", customerTaxId: "", isDefault: false };

function maskedTaxId(value: string) {
  if (value.length <= 4) return value;
  return `${"•".repeat(Math.min(value.length - 3, 8))}${value.slice(-3)}`;
}

export default function CustomerTaxProfilesScreen() {
  const { session } = useSession();
  return <TaxProfileBook key={session?.email ?? "guest"} />;
}

function TaxProfileBook() {
  const { session, request } = useSession();
  const [profiles, setProfiles] = useState<CustomerTaxProfile[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<CustomerTaxProfile | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!session) { setProfiles([]); return; }
    setLoading(true); setError("");
    try { setProfiles(await request<CustomerTaxProfile[]>("/api/v1/client/tax-profiles")); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "No pudimos cargar tus datos fiscales."); }
    finally { setLoading(false); }
  }, [request, session]);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  function startCreate() {
    setEditing(null); setCreating(true); setDeleting(null); setDraft({ ...emptyDraft, isDefault: profiles.length === 0 });
    setError(""); setNotice("");
  }

  function startEdit(profile: CustomerTaxProfile) {
    setEditing(profile); setCreating(false); setDeleting(null);
    setDraft({ label: profile.label, customerName: profile.customerName, customerTaxId: profile.customerTaxId, isDefault: profile.isDefault });
    setError(""); setNotice("");
  }

  function closeForm() {
    setEditing(null); setCreating(false); setDraft(emptyDraft); setError("");
  }

  async function save() {
    const payload = {
      label: draft.label.trim(), customerName: draft.customerName.trim(),
      customerTaxId: draft.customerTaxId.trim(), isDefault: draft.isDefault,
      ...(editing ? { expectedVersion: editing.version } : {}),
    };
    if (!payload.label || !payload.customerName || !payload.customerTaxId || payload.customerTaxId.length > 32) {
      setError("Completa nombre del perfil, nombre fiscal y NIT (máximo 32 caracteres)."); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await request<CustomerTaxProfile>(editing
        ? `/api/v1/client/tax-profiles/${editing.profileId}` : "/api/v1/client/tax-profiles", {
        method: editing ? "PUT" : "POST", body: JSON.stringify(payload),
      });
      setProfiles((current) => {
        const next = current.filter((profile) => profile.profileId !== saved.profileId)
          .map((profile) => saved.isDefault ? { ...profile, isDefault: false } : profile);
        return [saved, ...next].sort((left, right) => Number(right.isDefault) - Number(left.isDefault));
      });
      closeForm(); setNotice("Los datos para facturar se guardaron.");
    } catch (cause) {
      const outcomeMayBeUncertain = !(cause instanceof ApiError) || cause.status === undefined || cause.status >= 500;
      if (!editing && outcomeMayBeUncertain) {
        try {
          const current = await request<CustomerTaxProfile[]>("/api/v1/client/tax-profiles");
          setProfiles(current);
          const existingIds = new Set(profiles.map((profile) => profile.profileId));
          const recovered = current.find((profile) => profile.label.trim().toLowerCase() === payload.label.toLowerCase()
            && profile.customerName === payload.customerName && profile.customerTaxId === payload.customerTaxId
            && !existingIds.has(profile.profileId));
          if (recovered) {
            closeForm(); setNotice("El perfil aparece en la lista después de una respuesta incierta. Verifica antes de volver a intentarlo."); return;
          }
        } catch { /* Keep the original error when the recovery read also fails. */ }
      }
      setError(cause instanceof ApiError ? cause.message : "No se pudieron guardar los datos fiscales.");
    }
    finally { setBusy(false); }
  }

  async function remove(profileId: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await request<void>(`/api/v1/client/tax-profiles/${profileId}`, { method: "DELETE" });
      setProfiles((current) => current.filter((profile) => profile.profileId !== profileId));
      setDeleting(null); setNotice("El perfil fiscal se eliminó.");
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "No se pudo eliminar el perfil fiscal."); }
    finally { setBusy(false); }
  }

  if (!session) return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <Heading eyebrow="Tu perfil">Datos para facturar</Heading><Card><Notice>Inicia sesión para administrar tus perfiles fiscales.</Notice></Card>
  </Page></ScrollView>;

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <Heading eyebrow="Tu perfil">Datos para facturar</Heading>
    <Text style={ui.body}>Guarda perfiles para completar más rápido futuras solicitudes de factura. La emisión siempre depende del restaurante y su certificador.</Text>
    {notice ? <Notice tone="success">{notice}</Notice> : null}
    {error ? <Notice tone="error">{error}</Notice> : null}
    {loading && profiles.length === 0 ? <Notice>Cargando perfiles fiscales…</Notice> : null}
    {!loading && profiles.length === 0 ? <Card><Notice>Aún no tienes datos fiscales guardados.</Notice></Card> : null}
    <View style={ui.section}>{profiles.map((profile) => <Card key={profile.profileId}>
      <Text style={{ color: palette.ink, fontSize: 17, fontWeight: "800" }}>{profile.label}{profile.isDefault ? " · Predeterminado" : ""}</Text>
      <Text style={ui.body}>{profile.customerName}</Text>
      <Text style={ui.body}>NIT: {maskedTaxId(profile.customerTaxId)}</Text>
      {deleting === profile.profileId ? <View style={ui.section}>
        <Notice>¿Eliminar este perfil fiscal guardado?</Notice>
        <Button title="Sí, eliminar" busy={busy} onPress={() => void remove(profile.profileId)} />
        <Button title="Conservar" secondary onPress={() => setDeleting(null)} />
      </View> : <View style={ui.section}>
        <Button title="Editar perfil" secondary onPress={() => startEdit(profile)} />
        <Button title="Eliminar perfil" secondary onPress={() => { setDeleting(profile.profileId); setEditing(null); setCreating(false); }} />
      </View>}
    </Card>)}</View>
    <Button title={creating || editing ? "Cancelar edición" : "Agregar perfil fiscal"} secondary onPress={() => {
      if (creating || editing) closeForm(); else startCreate();
    }} />
    {creating || editing ? <Card>
      <Text style={{ color: palette.ink, fontSize: 18, fontWeight: "800" }}>{editing ? "Editar perfil" : "Nuevo perfil"}</Text>
      <Field label="Nombre del perfil" value={draft.label} onChangeText={(label) => setDraft((current) => ({ ...current, label }))} maxLength={60} placeholder="Personal, empresa…" />
      <Field label="Nombre o razón social" value={draft.customerName} onChangeText={(customerName) => setDraft((current) => ({ ...current, customerName }))} maxLength={150} />
      <Field label="NIT" value={draft.customerTaxId} onChangeText={(customerTaxId) => setDraft((current) => ({ ...current, customerTaxId }))} maxLength={32} autoCapitalize="characters" />
      <Button title={draft.isDefault ? "Usar como predeterminado ✓" : "Marcar predeterminado"} secondary
        onPress={() => setDraft((current) => ({ ...current, isDefault: !current.isDefault }))} />
      <Button title="Guardar perfil fiscal" busy={busy} disabled={busy} onPress={() => void save()} />
    </Card> : null}
    {!loading ? <Button title="Actualizar perfiles" secondary busy={loading} onPress={() => void refresh()} /> : null}
  </Page></ScrollView>;
}
