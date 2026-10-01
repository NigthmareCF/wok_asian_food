import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/providers/session-provider";

export default function RootLayout() {
  return <SessionProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false }}><Stack.Screen name="(tabs)" /><Stack.Screen name="messages" options={{ title: "Mensajes", headerShown: true }} /><Stack.Screen name="delivery" options={{ title: "Delivery", headerShown: true }} /><Stack.Screen name="addresses" options={{ title: "Direcciones", headerShown: true }} /></Stack></SessionProvider>;
}
