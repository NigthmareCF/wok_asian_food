import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, Heading, Notice, Page, palette, ui } from "@/components/ui";

export default function HomeScreen() {
  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <View style={{ paddingTop: 18, gap: 18 }}>
      <Text style={{ color: palette.red, fontWeight: "900", fontSize: 15, letterSpacing: 2 }}>WOK ASIAN FOOD</Text>
      <Heading eyebrow="Sabor para compartir">Tu próxima visita empieza aquí.</Heading>
      <Text style={ui.body}>Consulta el menú y solicita una reserva directamente al restaurante.</Text>
    </View>
    <Card><Text style={{ fontSize: 20, fontWeight: "800", color: palette.ink }}>Estado del restaurante</Text><Notice>La disponibilidad en tiempo real todavía no está conectada. Confirma tu solicitud con el equipo.</Notice></Card>
    <Card><Text style={{ fontSize: 20, fontWeight: "800", color: palette.ink }}>¿Qué te gustaría hacer?</Text><Button title="Explorar menú" onPress={() => router.push("/(tabs)/menu")} /><Button title="Solicitar una reserva" secondary onPress={() => router.push("/(tabs)/reservations")} /></Card>
    <Text style={[ui.body, { fontSize: 12 }]}>Aplicación Cliente · versión inicial conectada a servicios disponibles.</Text>
  </Page></ScrollView>;
}
