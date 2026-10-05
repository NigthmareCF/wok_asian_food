<<<<<<< HEAD
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/providers/session-provider";

export default function RootLayout() {
  return <SessionProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false }}><Stack.Screen name="(tabs)" /><Stack.Screen name="messages" options={{ title: "Mensajes", headerShown: true }} /><Stack.Screen name="delivery" options={{ title: "Delivery", headerShown: true }} /><Stack.Screen name="addresses" options={{ title: "Direcciones", headerShown: true }} /></Stack></SessionProvider>;
=======
import "../global.css";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/providers/session-provider";
import { Button, useUiTheme } from "@/components/ui";

function CatalogBackButton() {
  return <Button title="Volver" accessibilityLabel="Volver a la pantalla anterior" secondary onPress={() => {
    if (router.canGoBack()) router.back(); else router.replace("/(tabs)/menu");
  }} />;
}

const catalogHeader = { headerShown: true, headerBackVisible: false, headerLeft: () => <CatalogBackButton /> };

export default function RootLayout() {
  const { colors } = useUiTheme();
  return <SessionProvider><StatusBar style="auto" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, headerStyle: { backgroundColor: colors.navigation }, headerTintColor: colors.foreground }}><Stack.Screen name="(tabs)" /><Stack.Screen name="menu/[itemId]" options={{ ...catalogHeader, title: "Detalle del platillo" }} /><Stack.Screen name="cart" options={{ ...catalogHeader, title: "Carrito" }} /><Stack.Screen name="messages" options={{ title: "Mensajes", headerShown: true }} /><Stack.Screen name="delivery" options={{ title: "Delivery", headerShown: true }} /><Stack.Screen name="addresses" options={{ title: "Direcciones", headerShown: true }} /></Stack></SessionProvider>;
>>>>>>> 9997cf0e (fix(mobile): adjust BFF, add cart/menu flows, UI components, hooks and tests)
}
