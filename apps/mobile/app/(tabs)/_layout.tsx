import { Tabs } from "expo-router";
import { palette } from "@/components/ui";

export default function TabLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: palette.red, tabBarInactiveTintColor: palette.muted, tabBarStyle: { backgroundColor: "#fffaf2", borderTopColor: "#eadfce", height: 64, paddingBottom: 8, paddingTop: 6 }, tabBarLabelStyle: { fontWeight: "700", fontSize: 12 } }}>
    <Tabs.Screen name="index" options={{ title: "Inicio", tabBarAccessibilityLabel: "Inicio" }} />
    <Tabs.Screen name="menu" options={{ title: "Menú", tabBarAccessibilityLabel: "Menú" }} />
    <Tabs.Screen name="reservations" options={{ title: "Reservas", tabBarAccessibilityLabel: "Reservas" }} />
    <Tabs.Screen name="orders" options={{ title: "Solicitudes", tabBarAccessibilityLabel: "Solicitudes pickup" }} />
    <Tabs.Screen name="account" options={{ title: "Mi cuenta", tabBarAccessibilityLabel: "Mi cuenta" }} />
  </Tabs>;
}
