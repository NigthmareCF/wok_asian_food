import { router } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Button, Card, Heading, Notice, Page, Skeleton } from "@/components/ui";
import { ApiError, apiRequest } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

type Capability = { code: string; status: "ENABLED" | "MANUAL_APPROVAL" | "PAUSED" | "DISABLED" };
const serviceNames: Record<string, string> = {
  LOCAL: "Servicio en el restaurante", RESERVATIONS: "Reservas", DINE_IN_ONLINE: "Pedidos en mesa",
  PICKUP: "Para recoger", ONLINE_ORDERS: "Pedidos en línea", MESSAGING: "Mensajes",
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

  return <Page safeTop>
    <FlatList
      className="flex-1"
      contentContainerClassName="pb-6"
      data={capabilities ?? []}
      keyExtractor={(item) => item.code}
      ListHeaderComponent={<>
        <View className="mb-6 gap-6 lg:flex-row lg:items-center">
          <View className="flex-1 gap-4">
            <Text className="font-sans text-base font-extrabold tracking-eyebrow text-primary">WOK ASIAN FOOD</Text>
            <Heading eyebrow="Sabor para compartir">Tu próxima visita empieza aquí.</Heading>
            <Text className="font-sans text-base leading-6 text-muted-foreground">Consulta el menú y solicita una reserva directamente al restaurante.</Text>
          </View>
          <Card className="lg:flex-1">
            <Text accessibilityRole="header" className="font-sans text-xl font-extrabold text-foreground">¿Qué te gustaría hacer?</Text>
            <Button title="Explorar menú" onPress={() => router.push("/(tabs)/menu")} />
            <Button title="Solicitar una reserva" secondary onPress={() => router.push("/(tabs)/reservations")} />
            <Button title={session ? "Contactar al equipo WOK" : "Mensajes y atención"} secondary onPress={() => router.push("/messages")} />
          </Card>
        </View>
        <View className="rounded-t-lg border-x border-t border-border bg-surface p-4 sm:p-6">
          <Text accessibilityRole="header" className="font-sans text-xl font-extrabold text-foreground">Estado del restaurante</Text>
          {!capabilities && !statusError ? <View className="mt-4 gap-3" accessibilityLabel="Consultando el estado del restaurante">
            <Skeleton className="h-4 w-3/4" /><Skeleton /><Skeleton className="h-4 w-1/2" />
          </View> : null}
        </View>
      </>}
      renderItem={({ item }) => <View className="border-x border-border bg-surface px-4 sm:px-6">
        <View className="flex-row flex-wrap items-start justify-between gap-3 border-b border-border py-3">
          <Text className="flex-1 font-sans text-base leading-6 text-foreground">{serviceNames[item.code] ?? item.code}</Text>
          <Text className={`max-w-40 text-right font-sans text-sm font-bold ${item.status === "ENABLED" ? "text-success-foreground" : "text-muted-foreground"}`}>{statusNames[item.status]}</Text>
        </View>
      </View>}
      ListFooterComponent={<>
        <View className="gap-3 rounded-b-lg border-x border-b border-border bg-surface p-4 sm:p-6">
          {!capabilities?.length && !statusError ? <Notice>{capabilities ? "El restaurante todavía no publicó servicios." : "Consultando el estado actual…"}</Notice> : null}
          {statusError ? <Notice tone="error">{statusError}</Notice> : null}
          <Button title="Actualizar estado" secondary busy={refreshing} onPress={() => void refreshStatus()} />
          <Text className="font-sans text-xs leading-4 text-muted-foreground">Una solicitud de reserva requiere confirmación del equipo.</Text>
        </View>
        <Text className="mt-6 font-sans text-xs leading-4 text-muted-foreground">Aplicación Cliente · versión inicial conectada a servicios disponibles.</Text>
      </>}
    />
  </Page>;
}
