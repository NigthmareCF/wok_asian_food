import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ApiError, CustomerAddress } from "@/lib/api";
import {
  Button,
  Card,
  Field,
  Heading,
  Notice,
  Page,
  useUiTheme,
} from "@/components/ui";
import { useSession } from "@/providers/session-provider";
import { formatGuatemalaPhoneInput, isGuatemalaPhone } from "@/lib/identity";

type AddressDraft = {
  label: string;
  address: string;
  reference: string;
  contactPhone: string;
  isDefault: boolean;
};
const emptyDraft: AddressDraft = {
  label: "",
  address: "",
  reference: "",
  contactPhone: "",
  isDefault: false,
};

export default function AddressesScreen() {
  const { session, request } = useSession();
  return (
    <AddressBook
      key={session?.email ?? "guest"}
      session={session}
      request={request}
    />
  );
}

type AddressBookProps = Pick<
  ReturnType<typeof useSession>,
  "session" | "request"
>;

function AddressBook({ session, request }: AddressBookProps) {
  const { colors, ui } = useUiTheme();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<AddressDraft>(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadAddresses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setAddresses(
        await request<CustomerAddress[]>("/api/v1/client/addresses"),
      );
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "No se pudieron cargar tus direcciones.",
      );
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    if (session) void Promise.resolve().then(loadAddresses);
  }, [loadAddresses, session]);

  function startEdit(address: CustomerAddress) {
    setCreating(false);
    setEditingId(address.addressId);
    setDeleteId(null);
    setDraft({
      label: address.label,
      address: address.address,
      reference: address.reference ?? "",
      contactPhone: formatGuatemalaPhoneInput(address.contactPhone),
      isDefault: address.isDefault,
    });
    setError("");
    setNotice("");
  }

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setDeleteId(null);
    setDraft({ ...emptyDraft, isDefault: addresses.length === 0 });
    setError("");
    setNotice("");
  }

  async function save() {
    if (
      !draft.label.trim() ||
      draft.address.trim().length < 5 ||
      !isGuatemalaPhone(draft.contactPhone)
    ) {
      setError(
        "Revisa el nombre, la dirección y el teléfono de Guatemala (8 dígitos en grupos de cuatro).",
      );
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const current = addresses.find((item) => item.addressId === editingId);
      const saved = await request<CustomerAddress>(
        editingId
          ? `/api/v1/client/addresses/${editingId}`
          : "/api/v1/client/addresses",
        {
          method: editingId ? "PUT" : "POST",
          body: JSON.stringify({
            ...draft,
            label: draft.label.trim(),
            address: draft.address.trim(),
            reference: draft.reference.trim(),
            contactPhone: draft.contactPhone.trim(),
            ...(current ? { expectedVersion: current.version } : {}),
          }),
        },
      );
      await loadAddresses();
      setEditingId(null);
      setCreating(false);
      setDraft(emptyDraft);
      setNotice("La dirección se guardó en tu cuenta.");
      if (saved.isDefault)
        setAddresses((items) =>
          items.map((item) =>
            item.addressId === saved.addressId
              ? saved
              : { ...item, isDefault: false },
          ),
        );
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "No se pudo guardar la dirección.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(addressId: string) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await request<void>(`/api/v1/client/addresses/${addressId}`, {
        method: "DELETE",
      });
      setAddresses((items) =>
        items.filter((item) => item.addressId !== addressId),
      );
      setDeleteId(null);
      if (editingId === addressId) {
        setEditingId(null);
        setCreating(false);
        setDraft(emptyDraft);
      }
      setNotice("La dirección se eliminó de tu cuenta.");
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "No se pudo eliminar la dirección.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!session)
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <Page>
          <Heading eyebrow="Tu perfil">Direcciones guardadas</Heading>
          <Card>
            <Notice>Inicia sesión para administrar tus direcciones.</Notice>
          </Card>
        </Page>
      </ScrollView>
    );

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Page>
        <Heading eyebrow="Tu perfil">Direcciones guardadas</Heading>
        <Text style={ui.body}>
          Administra las direcciones asociadas a tu cuenta. Se usarán como datos
          de entrega y no confirman cobertura ni disponibilidad.
        </Text>
        {notice ? <Notice tone="success">{notice}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {loading ? <Notice>Cargando tus direcciones…</Notice> : null}
        {!loading && addresses.length === 0 ? (
          <Card>
            <Notice>Aún no tienes direcciones guardadas.</Notice>
          </Card>
        ) : null}
        <View style={ui.section}>
          {addresses.map((item) => (
            <Card key={item.addressId}>
              <Text
                style={{
                  color: colors.foreground,
                  fontSize: 17,
                  fontWeight: "800",
                }}
              >
                {item.label}
                {item.isDefault ? " · Predeterminada" : ""}
              </Text>
              <Text style={ui.body}>{item.address}</Text>
              {item.reference ? (
                <Text style={ui.body}>Referencia: {item.reference}</Text>
              ) : null}
              <Text style={ui.body}>Teléfono: {item.contactPhone}</Text>
              {deleteId === item.addressId ? (
                <>
                  <Notice>
                    ¿Eliminar esta dirección guardada? Esta acción no se puede
                    deshacer.
                  </Notice>
                  <Button
                    title="Sí, eliminar dirección"
                    busy={saving}
                    onPress={() => void remove(item.addressId)}
                  />
                  <Button
                    title="Conservar dirección"
                    secondary
                    onPress={() => setDeleteId(null)}
                  />
                </>
              ) : (
                <View style={ui.section}>
                  <Button
                    title="Editar dirección"
                    secondary
                    onPress={() => startEdit(item)}
                  />
                  <Button
                    title="Eliminar dirección"
                    secondary
                    onPress={() => {
                      setDeleteId(item.addressId);
                      setEditingId(null);
                      setDraft(emptyDraft);
                    }}
                  />
                </View>
              )}
            </Card>
          ))}
        </View>
        <Button
          title={
            editingId || creating ? "Cancelar edición" : "Agregar dirección"
          }
          secondary
          onPress={() => {
            if (editingId || creating) {
              setEditingId(null);
              setCreating(false);
              setDraft(emptyDraft);
              setError("");
            } else startCreate();
          }}
        />
        {editingId || creating ? (
          <Card>
            <Text
              style={{
                color: colors.foreground,
                fontSize: 18,
                fontWeight: "800",
              }}
            >
              {editingId ? "Editar dirección" : "Nueva dirección"}
            </Text>
            <Field
              label="Nombre"
              value={draft.label}
              onChangeText={(label) =>
                setDraft((current) => ({ ...current, label }))
              }
              maxLength={80}
              placeholder="Casa, trabajo…"
            />
            <Field
              label="Dirección completa"
              value={draft.address}
              onChangeText={(address) =>
                setDraft((current) => ({ ...current, address }))
              }
              multiline
              maxLength={500}
              placeholder="Zona, calle/avenida, número"
            />
            <Field
              label="Referencia (opcional)"
              value={draft.reference}
              onChangeText={(reference) =>
                setDraft((current) => ({ ...current, reference }))
              }
              maxLength={300}
            />
            <Field
              label="Teléfono de contacto"
              value={draft.contactPhone}
              onChangeText={(value) =>
                setDraft((current) => ({
                  ...current,
                  contactPhone: formatGuatemalaPhoneInput(value),
                }))
              }
              keyboardType="phone-pad"
              maxLength={9}
              placeholder="1234 5678"
            />
            <Button
              title={
                draft.isDefault
                  ? "Dirección predeterminada ✓"
                  : "Usar como predeterminada"
              }
              secondary
              onPress={() =>
                setDraft((current) => ({
                  ...current,
                  isDefault: !current.isDefault,
                }))
              }
            />
            <Button
              title="Guardar dirección"
              busy={saving}
              onPress={() => void save()}
            />
          </Card>
        ) : null}
        {!loading ? (
          <Button
            title="Actualizar lista"
            secondary
            busy={saving}
            onPress={() => void loadAddresses()}
          />
        ) : null}
      </Page>
    </ScrollView>
  );
}
