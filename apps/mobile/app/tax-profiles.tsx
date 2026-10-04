import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ApiError, CustomerTaxProfile } from "@/lib/api";
import { Button, Card, Field, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { useSession } from "@/providers/session-provider";

type ProfileDraft = { label: string; customerName: string; customerTaxId: string; isDefault: boolean };
const emptyDraft: ProfileDraft = { label: "", customerName: "", customerTaxId: "", isDefault: false };

export default function TaxProfilesScreen() {
  const { session, request } = useSession();
  return <TaxProfileBook key={session?.email ?? "guest"} session={session} request={request} />;
}

type TaxProfileBookProps = Pick<ReturnType<typeof useSession>, "session" | "request">;

function TaxProfileBook({ session, request }: TaxProfileBookProps) {
  const [profiles, setProfiles] = useState<CustomerTaxProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadProfiles = useCallback(async () => {
    setLoading(true); setError("");
    try { setProfiles(await request<CustomerTaxProfile[]>("/api/v1/client/tax-profiles")); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "No se pudieron cargar tus perfiles fiscales."); }
    finally { setLoading(false); }
  }, [request]);

  useEffect(() => { if (session) void Promise.resolve().then(loadProfiles); }, [loadProfiles, session]);

  function startEdit(profile: CustomerTaxProfile) {
    setCreating(false); setEditingId(profile.profileId); setDeleteId(null);
    setDraft({ label: profile.label, customerName: profile.customerName, customerTaxId: profile.customerTaxId, isDefault: profile.isDefault });
    setError(""); setNotice("");
  }

  function startCreate() {
    setCreating(true); setEditingId(null); setDeleteId(null);
    setDraft({ ...emptyDraft, isDefault: profiles.length === 0 }); setError(""); setNotice("");
  }

  async function save() {
    if (!draft.label.trim() || !draft.customerName.trim() || !draft.customerTaxId.trim()) {
      setError("Completa el nombre del perfil, la razón social y el NIT."); return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const current = profiles.find((item) => item.profileId === editingId);
      const saved = await request<CustomerTaxProfile>(editingId ? `/api/v1/client/tax-profiles/${editingId}` : "/api/v1/client/tax-profiles", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify({ ...draft, label: draft.label.trim(), customerName: draft.customerName.trim(), customerTaxId: draft.customerTaxId.trim(), ...(current ? { expectedVersion: current.version } : {}) }),
      });
      await loadProfiles(); setEditingId(null); setCreating(false); setDraft(emptyDraft);
      setProfiles((items) => items.map((item) => item.profileId === saved.profileId ? saved : saved.isDefault ? { ...item, isDefault: false } : item));
      setNotice("El perfil fiscal se guardó en tu cuenta.");
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "No se pudo guardar el perfil fiscal."); }
    finally { setSaving(false); }
  }

  async function remove(profileId: string) {
    setSaving(true); setError(""); setNotice("");
    try {
      await request<void>(`/api/v1/client/tax-profiles/${profileId}`, { method: "DELETE" });
      setProfiles((items) => items.filter((item) => item.profileId !== profileId)); setDeleteId(null);
      setNotice("El perfil fiscal se eliminó de tu cuenta.");
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "No se pudo eliminar el perfil fiscal."); }
    finally { setSaving(false); }
  }

  if (!session) return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page><Heading eyebrow="Tu perfil">Perfiles fiscales</Heading><Card><Notice>Inicia sesión para administrar tus perfiles fiscales.</Notice></Card></Page></ScrollView>;

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page><Heading eyebrow="Tu perfil">Perfiles fiscales</Heading>
    <Text style={ui.body}>Guarda los datos que quieras usar al solicitar factura. El perfil predeterminado se copiará en nuevas solicitudes; no emite ni certifica documentos FEL.</Text>
    {notice ? <Notice tone="success">{notice}</Notice> : null}
    {error ? <Notice tone="error">{error}</Notice> : null}
    {loading ? <Notice>Cargando tus perfiles fiscales…</Notice> : null}
    {!loading && profiles.length === 0 ? <Card><Notice>Aún no tienes perfiles fiscales guardados.</Notice></Card> : null}
    <View style={ui.section}>{profiles.map((item) => <Card key={item.profileId}>
      <Text style={{ color: palette.ink, fontSize: 17, fontWeight: "800" }}>{item.label}{item.isDefault ? " · Predeterminado" : ""}</Text>
      <Text style={ui.body}>{item.customerName} · NIT {item.customerTaxId}</Text>
      {deleteId === item.profileId ? <>
        <Notice>¿Eliminar este perfil fiscal guardado? No cambia documentos ya emitidos.</Notice>
        <Button title="Sí, eliminar perfil" busy={saving} onPress={() => void remove(item.profileId)} />
        <Button title="Conservar perfil" secondary onPress={() => setDeleteId(null)} />
      </> : <View style={ui.section}>
        <Button title="Editar perfil" secondary onPress={() => startEdit(item)} />
        <Button title="Eliminar perfil" secondary onPress={() => { setDeleteId(item.profileId); setEditingId(null); setDraft(emptyDraft); }} />
      </View>}
    </Card>)}</View>
    <Button title={editingId || creating ? "Cancelar edición" : "Agregar perfil fiscal"} secondary onPress={() => {
      if (editingId || creating) { setEditingId(null); setCreating(false); setDraft(emptyDraft); setError(""); }
      else startCreate();
    }} />
    {(editingId || creating) ? <Card>
      <Text style={{ color: palette.ink, fontSize: 18, fontWeight: "800" }}>{editingId ? "Editar perfil fiscal" : "Nuevo perfil fiscal"}</Text>
      <Field label="Nombre para identificarlo" value={draft.label} onChangeText={(label) => setDraft((current) => ({ ...current, label }))} maxLength={60} placeholder="Personal, negocio…" />
      <Field label="Nombre o razón social" value={draft.customerName} onChangeText={(customerName) => setDraft((current) => ({ ...current, customerName }))} maxLength={150} />
      <Field label="NIT o CF" value={draft.customerTaxId} onChangeText={(customerTaxId) => setDraft((current) => ({ ...current, customerTaxId }))} maxLength={32} autoCapitalize="characters" />
      <Button title={draft.isDefault ? "Perfil predeterminado ✓" : "Usar como predeterminado"} secondary onPress={() => setDraft((current) => ({ ...current, isDefault: !current.isDefault }))} />
      <Button title="Guardar perfil fiscal" busy={saving} onPress={() => void save()} />
    </Card> : null}
    {!loading ? <Button title="Actualizar lista" secondary busy={saving} onPress={() => void loadProfiles()} /> : null}
  </Page></ScrollView>;
}
