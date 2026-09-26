import { ScrollView, Text } from "react-native";
import { Card, Heading, Notice, Page, palette, ui } from "@/components/ui";

export default function MenuScreen() {
  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page><Heading eyebrow="Catálogo">Menú WOK</Heading>
    <Card><Text style={{ fontWeight: "800", color: palette.ink, fontSize: 18 }}>El menú se publicará aquí</Text><Text style={ui.body}>Estamos preparando el catálogo oficial con categorías, precios y opciones confirmadas por el restaurante.</Text></Card>
    <Notice>El menú real y el endpoint de catálogo aún no están disponibles. No mostramos productos ni precios inventados.</Notice>
  </Page></ScrollView>;
}
