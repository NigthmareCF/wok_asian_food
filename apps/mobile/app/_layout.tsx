import "../global.css";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/providers/session-provider";
import { Button, useUiTheme } from "@/components/ui";

function CatalogBackButton() {
  return (
    <Button
      title="Volver"
      accessibilityLabel="Volver a la pantalla anterior"
      secondary
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)/menu");
      }}
    />
  );
}

const catalogHeader = {
  headerShown: true,
  headerBackVisible: false,
  headerLeft: () => <CatalogBackButton />,
};

export default function RootLayout() {
  const { colors } = useUiTheme();
  return (
    <SessionProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          headerStyle: { backgroundColor: colors.navigation },
          headerTintColor: colors.foreground,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="menu/[itemId]"
          options={{ ...catalogHeader, title: "Detalle del platillo" }}
        />
        <Stack.Screen
          name="cart"
          options={{ ...catalogHeader, title: "Carrito" }}
        />
        <Stack.Screen
          name="messages"
          options={{ title: "Mensajes", headerShown: true }}
        />
        <Stack.Screen
          name="delivery"
          options={{ title: "Delivery", headerShown: true }}
        />
        <Stack.Screen
          name="addresses"
          options={{ title: "Direcciones", headerShown: true }}
        />
        <Stack.Screen
          name="location"
          options={{ title: "Ubicación", headerShown: true }}
        />
      </Stack>
    </SessionProvider>
  );
}
