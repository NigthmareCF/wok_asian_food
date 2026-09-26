import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/providers/session-provider";

export default function RootLayout() {
  return <SessionProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false }}><Stack.Screen name="(tabs)" /></Stack></SessionProvider>;
}
