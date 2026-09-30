import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { ApiError, apiRequest } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

type Capability = { code: string; status: "ENABLED" | "MANUAL_APPROVAL" | "PAUSED" | "DISABLED" };
const serviceNames: Record<string, string> = {
  LOCAL: "Servicio en el restaurante", RESERVATIONS: "Reservas", DINE_IN_ONLINE: "Pedidos en mesa",
  PICKUP: "Para recoger", DELIVERY: "Delivery", ONLINE_ORDERS: "Pedidos en línea", MESSAGING: "Mensajes",
  ONLINE_PAYMENTS: "Pagos en línea",
};
const publicServiceCodes = new Set(Object.keys(serviceNames));
const statusNames: Record<Capability["status"], string> = {
  ENABLED: "Disponible", MANUAL_APPROVAL: "Sujeto a confirmación", PAUSED: "Pausado", DISABLED: "No disponible",
};

export default function HomeScreen() {
  const { session } = useSession();
  const [capabilities, setCapabilities] = useState<Capability[] | null>(null);
  const [statusError, setStatusError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => apiRequest<Capability[]>("/api/v1/public/service-capabilities"))
      .then((items) => { if (active) { setCapabilities(items.filter((item) => publicServiceCodes.has(item.code))); setStatusError(""); } })
      .catch((error) => {
        if (active) setStatusError(error instanceof ApiError ? error.message : "No pudimos consultar el estado del restaurante.");
      });
    return () => { active = false; };
  }, []);

  async function refreshStatus() {
    setRefreshing(true); setStatusError("");
    try {
      const items = await apiRequest<Capability[]>("/api/v1/public/service-capabilities");
      setCapabilities(items.filter((item) => publicServiceCodes.has(item.code)));
    }
    catch (error) { setStatusError(error instanceof ApiError ? error.message : "No pudimos consultar el estado del restaurante."); }
    finally { setRefreshing(false); }
  }

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <View style={{ paddingTop: 18, gap: 18 }}>
      <Text style={{ color: palette.red, fontWeight: "900", fontSize: 15, letterSpacing: 2 }}>WOK ASIAN FOOD</Text>
      <Heading eyebrow="Sabor para compartir">Tu próxima visita empieza aquí.</Heading>
      <Text style={ui.body}>Consulta el menú y solicita una reserva directamente al restaurante.</Text>
    </View>
    <Card><Text style={{ fontSize: 20, fontWeight: "800", color: palette.ink }}>Estado del restaurante</Text>
      {capabilities?.length ? capabilities.map((item) => <View key={item.code} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, borderBottomWidth: 1, borderBottomColor: "#eadfce", paddingVertical: 8 }}>
        <Text style={[ui.body, { flex: 1, color: palette.ink }]}>{serviceNames[item.code] ?? item.code}</Text>
        <Text style={{ color: item.status === "ENABLED" ? palette.green : palette.muted, fontWeight: "700", textAlign: "right" }}>{statusNames[item.status]}</Text>
      </View>) : null}
      {!capabilities?.length && !statusError ? <Notice>{capabilities ? "El restaurante todavía no publicó servicios." : "Consultando el estado actual…"}</Notice> : null}
      {statusError ? <Notice tone="error">{statusError}</Notice> : null}
      <Button title="Actualizar estado" secondary busy={refreshing} onPress={() => void refreshStatus()} />
      <Text style={{ color: palette.muted, fontSize: 12 }}>Una solicitud de reserva requiere confirmación del equipo.</Text>
    </Card>
    <Card><Text style={{ fontSize: 20, fontWeight: "800", color: palette.ink }}>¿Qué te gustaría hacer?</Text><Button title="Explorar menú" onPress={() => router.push("/(tabs)/menu")} /><Button title="Solicitar una reserva" secondary onPress={() => router.push("/(tabs)/reservations")} /><Button title={session ? "Contactar al equipo WOK" : "Mensajes y atención"} secondary onPress={() => router.push("/messages")} /></Card>
    <Text style={[ui.body, { fontSize: 12 }]}>Aplicación Cliente · versión inicial conectada a servicios disponibles.</Text>
  </Page></ScrollView>;
}
