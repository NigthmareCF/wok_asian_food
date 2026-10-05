import { Tabs } from "expo-router";
import { SymbolView, SymbolViewProps } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUiTheme } from "@/components/ui";

const tabIcons = {
  index: { ios: "house", android: "home", web: "home" },
  menu: { ios: "fork.knife", android: "restaurant", web: "restaurant" },
  reservations: { ios: "calendar", android: "calendar_month", web: "calendar_month" },
  orders: { ios: "list.bullet.rectangle", android: "receipt_long", web: "receipt_long" },
  account: { ios: "person.crop.circle", android: "person", web: "person" },
} satisfies Record<string, SymbolViewProps["name"]>;

export default function TabLayout() {
  const { colors } = useUiTheme();
  const insets = useSafeAreaInsets();
  return <Tabs screenOptions={({ route }) => ({ headerShown: false, sceneStyle: { backgroundColor: colors.background }, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.mutedForeground, tabBarStyle: { backgroundColor: colors.navigation, borderTopColor: colors.border, height: 72 + insets.bottom, paddingBottom: Math.max(8, insets.bottom), paddingTop: 8 }, tabBarItemStyle: { minHeight: 44, minWidth: 44 }, tabBarLabelStyle: { fontWeight: "700", fontSize: 12, lineHeight: 16 }, tabBarIcon: ({ color }) => <SymbolView name={tabIcons[route.name as keyof typeof tabIcons]} tintColor={color} size={24} /> })}>
    <Tabs.Screen name="index" options={{ title: "Inicio", tabBarAccessibilityLabel: "Inicio" }} />
    <Tabs.Screen name="menu" options={{ title: "Menú", tabBarAccessibilityLabel: "Menú" }} />
    <Tabs.Screen name="reservations" options={{ title: "Reservas", tabBarAccessibilityLabel: "Reservas" }} />
    <Tabs.Screen name="orders" options={{ title: "Solicitudes", tabBarAccessibilityLabel: "Solicitudes pickup" }} />
    <Tabs.Screen name="account" options={{ title: "Mi cuenta", tabBarAccessibilityLabel: "Mi cuenta" }} />
  </Tabs>;
}
