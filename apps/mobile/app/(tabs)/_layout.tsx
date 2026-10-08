import { Tabs } from "expo-router";
import { SymbolView, SymbolViewProps } from "expo-symbols";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUiTheme } from "@/components/ui";
import { useCart } from "@/hooks/use-cart";

const tabIcons = {
  index: { ios: "house", android: "home", web: "home" },
  menu: { ios: "fork.knife", android: "restaurant", web: "restaurant" },
  reservations: {
    ios: "calendar",
    android: "calendar_month",
    web: "calendar_month",
  },
  orders: {
    ios: "list.bullet.rectangle",
    android: "receipt_long",
    web: "receipt_long",
  },
  account: { ios: "person.crop.circle", android: "person", web: "person" },
} satisfies Record<string, SymbolViewProps["name"]>;

export default function TabLayout() {
  const { colors } = useUiTheme();
  const cart = useCart();
  const count = Object.values(cart.items).reduce(
    (total, quantity) => total + quantity,
    0,
  );
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.navigation,
          borderTopColor: colors.border,
          height: 76 + insets.bottom,
          paddingBottom: Math.max(8, insets.bottom),
          paddingTop: 8,
        },
        tabBarItemStyle: { minHeight: 44, minWidth: 44 },
        tabBarLabelStyle: { fontWeight: "700", fontSize: 11, lineHeight: 16 },
        tabBarBadgeStyle: {
          backgroundColor: colors.primary,
          color: colors.actionForeground,
          fontSize: 10,
          fontWeight: "800",
        },
        tabBarIcon: ({ color, focused }) => (
          <View
            accessible={false}
            style={{
              width: 48,
              height: 32,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: focused ? colors.surfaceElevated : "transparent",
              borderBottomWidth: focused ? 2 : 0,
              borderBottomColor: colors.primary,
            }}
          >
            <SymbolView
              name={tabIcons[route.name as keyof typeof tabIcons]}
              tintColor={color}
              size={22}
            />
          </View>
        ),
      })}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Inicio", tabBarAccessibilityLabel: "Inicio" }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: "Menú",
          tabBarAccessibilityLabel: count
            ? `Menú, ${count} unidades en tu pedido`
            : "Menú",
          tabBarBadge: count ? (count > 99 ? "99+" : count) : undefined,
        }}
      />
      <Tabs.Screen
        name="reservations"
        options={{ title: "Reservas", tabBarAccessibilityLabel: "Reservas" }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Solicitudes",
          tabBarAccessibilityLabel: "Mis solicitudes para recoger",
        }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Mi cuenta", tabBarAccessibilityLabel: "Mi cuenta" }}
      />
    </Tabs>
  );
}
