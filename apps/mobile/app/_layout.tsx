import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/providers/session-provider";
import { useUiTheme } from "@/components/ui";

export default function RootLayout() {
  const { colors } = useUiTheme();
  return <SessionProvider><StatusBar style="auto" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, headerStyle: { backgroundColor: colors.navigation }, headerTintColor: colors.foreground }}><Stack.Screen name="(tabs)" /><Stack.Screen name="messages" options={{ title: "Mensajes", headerShown: true }} /><Stack.Screen name="delivery" options={{ title: "Delivery", headerShown: true }} /><Stack.Screen name="addresses" options={{ title: "Direcciones", headerShown: true }} /></Stack></SessionProvider>;
}
