import { router } from "expo-router";
import { SymbolView, SymbolViewProps } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Brand } from "@/components/brand";
import { HomeHero } from "@/components/home-hero";
import { ProductImage } from "@/components/product-image";
import {
  Button,
  Card,
  Notice,
  Page,
  Skeleton,
  StatusChip,
  useUiTheme,
} from "@/components/ui";
import { useCart } from "@/hooks/use-cart";
import { useMenu } from "@/hooks/use-menu";
import { apiRequest } from "@/lib/api";
import { formatPrice, menuProducts } from "@/lib/catalog";
import {
  canHomeQuickAdd,
  homeCarouselProducts,
  homeProductRoute,
  selectHomeHero,
} from "@/lib/home-presentation";
import { useSession } from "@/providers/session-provider";
import { homeCopy } from "@/theme/home-copy";

type Capability = {
  code: string;
  status: "ENABLED" | "MANUAL_APPROVAL" | "PAUSED" | "DISABLED";
};
const publicServiceCodes = new Set(Object.keys(homeCopy.serviceNames));
const shortcuts = [
  {
    title: homeCopy.shortcuts.menu,
    href: "/(tabs)/menu",
    icon: { ios: "fork.knife", android: "restaurant", web: "restaurant" },
  },
  {
    title: homeCopy.shortcuts.reservations,
    href: "/(tabs)/reservations",
    icon: { ios: "calendar", android: "calendar_month", web: "calendar_month" },
  },
  {
    title: homeCopy.shortcuts.orders,
    href: "/(tabs)/orders",
    icon: {
      ios: "list.bullet.rectangle",
      android: "receipt_long",
      web: "receipt_long",
    },
  },
] as const;
const cardWidth = 256;
const cardGap = 12;

export default function HomeScreen() {
  const { session } = useSession();
  const { colors } = useUiTheme();
  const menu = useMenu();
  const cart = useCart();
  const products =
    menu.isPending || menu.isError ? [] : homeCarouselProducts(menu.data);
  const hero =
    menu.isPending || menu.isError
      ? null
      : selectHomeHero(menuProducts(menu.data));
  const [capabilities, setCapabilities] = useState<Capability[] | null>(null);
  const [statusError, setStatusError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    void apiRequest<Capability[]>("/api/v1/public/service-capabilities")
      .then((items) => {
        if (active) {
          setCapabilities(
            items.filter((item) => publicServiceCodes.has(item.code)),
          );
          setStatusError("");
        }
      })
      .catch(() => {
        if (active) setStatusError(homeCopy.statusError);
      });
    return () => {
      active = false;
    };
  }, []);

  async function refreshStatus() {
    setRefreshing(true);
    setStatusError("");
    try {
      const items = await apiRequest<Capability[]>(
        "/api/v1/public/service-capabilities",
      );
      setCapabilities(
        items.filter((item) => publicServiceCodes.has(item.code)),
      );
    } catch {
      setStatusError(homeCopy.statusError);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Page safeTop>
      <FlatList
        data={capabilities ?? []}
        keyExtractor={(item) => item.code}
        className="flex-1"
        contentContainerClassName="pb-6"
        ListHeaderComponent={
          <View className="gap-5 pb-4">
            <View className="gap-2">
              <Brand compact />
              <Text className="font-sans text-xs text-muted-foreground">
                {session ? homeCopy.returningGreeting : homeCopy.greeting}
              </Text>
            </View>
            <HomeHero
              product={hero}
              onPress={() => router.push(homeProductRoute(hero))}
            />
            <View className="gap-3">
              <Text
                accessibilityRole="header"
                className="font-sans text-xl font-extrabold text-foreground"
              >
                {homeCopy.carouselTitle}
              </Text>
              {menu.isPending ? (
                <View
                  accessibilityLabel={homeCopy.carouselLoading}
                  className="flex-row gap-3 overflow-hidden"
                >
                  <Skeleton className="h-64 w-64" />
                  <Skeleton className="h-64 w-64" />
                </View>
              ) : menu.isError ? (
                <Card>
                  <Notice tone="error">{homeCopy.menuError}</Notice>
                  <Button
                    title={homeCopy.retry}
                    secondary
                    busy={menu.isFetching}
                    onPress={() => void menu.refetch()}
                  />
                </Card>
              ) : products.length === 0 ? (
                <Card>
                  <Text className="font-sans text-sm leading-5 text-muted-foreground">
                    {homeCopy.menuEmpty}
                  </Text>
                </Card>
              ) : (
                <ScrollView
                  horizontal
                  pagingEnabled={Platform.OS === "web"}
                  snapToInterval={cardWidth + cardGap}
                  snapToAlignment="start"
                  decelerationRate="fast"
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: cardGap, paddingBottom: 2 }}
                >
                  {products.map((item) => {
                    const addEnabled = canHomeQuickAdd({
                      ready: cart.ready,
                      attempt: cart.attempt,
                      isFetching: menu.isFetching,
                      isError: menu.isError,
                      quantity: cart.items[item.id] ?? 0,
                    });
                    return (
                      <View
                        key={item.id}
                        style={{ width: cardWidth }}
                        className="overflow-hidden rounded-lg border border-border bg-surface"
                      >
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={homeCopy.detailLabel(
                            item.name,
                            formatPrice(item),
                          )}
                          onPress={() => router.push(homeProductRoute(item))}
                          style={({
                            pressed,
                            focused,
                          }: {
                            pressed: boolean;
                            focused?: boolean;
                          }) => ({
                            minHeight: 44,
                            minWidth: 44,
                            opacity: 1,
                            backgroundColor: pressed
                              ? colors.surfaceElevated
                              : "transparent",
                            borderWidth: 2,
                            borderColor: focused
                              ? colors.accentText
                              : "transparent",
                          })}
                        >
                          <ProductImage
                            reference={item.imageReference}
                            name={item.name}
                          />
                          <Text
                            numberOfLines={2}
                            className="px-4 pt-3 font-sans text-base font-extrabold text-foreground"
                          >
                            {item.name}
                          </Text>
                        </Pressable>
                        <View className="flex-row items-center justify-between gap-2 px-4 pb-3 pt-2">
                          <Text
                            style={{ color: colors.accentText }}
                            className="font-sans text-lg font-extrabold"
                          >
                            {formatPrice(item)}
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={homeCopy.addLabel(item.name)}
                            accessibilityState={{ disabled: !addEnabled }}
                            disabled={!addEnabled}
                            onPress={() => {
                              if (addEnabled) cart.changeQuantity(item.id, 1);
                            }}
                            style={({
                              pressed,
                              focused,
                            }: {
                              pressed: boolean;
                              focused?: boolean;
                            }) => ({
                              width: 44,
                              height: 44,
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 8,
                              borderWidth: 2,
                              borderColor: focused
                                ? colors.accentText
                                : "transparent",
                              opacity: addEnabled ? 1 : 0.55,
                              backgroundColor:
                                pressed && addEnabled
                                  ? colors.primaryHover
                                  : colors.primary,
                            })}
                          >
                            <SymbolView
                              name={{ ios: "plus", android: "add", web: "add" }}
                              size={22}
                              tintColor={colors.actionForeground}
                            />
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={homeCopy.menuAction}
                onPress={() => router.push("/(tabs)/menu")}
                style={({
                  pressed,
                  focused,
                }: {
                  pressed: boolean;
                  focused?: boolean;
                }) => ({
                  minHeight: 44,
                  minWidth: 44,
                  alignSelf: "flex-start",
                  justifyContent: "center",
                  opacity: 1,
                  backgroundColor: pressed
                    ? colors.surfaceElevated
                    : "transparent",
                  paddingHorizontal: 8,
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: focused ? colors.accentText : "transparent",
                })}
              >
                <Text
                  style={{ color: colors.accentText }}
                  className="font-sans text-sm font-bold"
                >
                  {homeCopy.menuAction}
                </Text>
              </Pressable>
            </View>
            <View className="flex-row items-center gap-3 border-t border-border pt-4">
              {shortcuts.map((shortcut) => (
                <Pressable
                  key={shortcut.title}
                  accessibilityRole="button"
                  accessibilityLabel={shortcut.title}
                  onPress={() => router.push(shortcut.href)}
                  style={({
                    pressed,
                    focused,
                  }: {
                    pressed: boolean;
                    focused?: boolean;
                  }) => ({
                    flex: 1,
                    minHeight: 44,
                    minWidth: 44,
                    opacity: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 2,
                    borderColor: focused ? colors.accentText : "transparent",
                    backgroundColor: pressed
                      ? colors.surfaceElevated
                      : "transparent",
                  })}
                >
                  <SymbolView
                    name={shortcut.icon as SymbolViewProps["name"]}
                    size={22}
                    tintColor={colors.accentText}
                  />
                  <Text className="font-sans text-xs font-bold text-foreground">
                    {shortcut.title}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View className="gap-2 border-t border-border pt-4">
              <Text
                accessibilityRole="header"
                className="font-sans text-xl font-extrabold text-foreground"
              >
                {homeCopy.statusTitle}
              </Text>
              <Text className="font-sans text-sm leading-5 text-muted-foreground">
                {homeCopy.statusDescription}
              </Text>
              {!capabilities && !statusError ? (
                <View
                  accessibilityLabel={homeCopy.statusLoading}
                  className="gap-3"
                >
                  <Skeleton />
                  <Skeleton className="w-1/2" />
                </View>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View className="mb-2 gap-2 rounded-lg border border-border bg-surface p-4">
            <Text className="font-sans text-base font-bold text-foreground">
              {homeCopy.serviceNames[item.code]}
            </Text>
            <StatusChip
              label={
                homeCopy.statusNames[item.status] ?? homeCopy.statusUnknown
              }
              tone={
                item.status === "ENABLED"
                  ? "success"
                  : item.status === "MANUAL_APPROVAL"
                    ? "warning"
                    : "info"
              }
            />
          </View>
        )}
        ListFooterComponent={
          <View className="gap-3 pt-2">
            {!capabilities?.length && !statusError && capabilities ? (
              <Notice>{homeCopy.statusEmpty}</Notice>
            ) : null}
            {statusError ? <Notice tone="error">{statusError}</Notice> : null}
            <Button
              title={
                statusError ? homeCopy.statusRetry : homeCopy.statusRefresh
              }
              secondary
              busy={refreshing}
              onPress={() => void refreshStatus()}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={homeCopy.contact}
              onPress={() => router.push("/messages")}
              style={({
                pressed,
                focused,
              }: {
                pressed: boolean;
                focused?: boolean;
              }) => ({
                minHeight: 44,
                minWidth: 44,
                alignSelf: "flex-start",
                justifyContent: "center",
                opacity: 1,
                backgroundColor: pressed
                  ? colors.surfaceElevated
                  : "transparent",
                paddingHorizontal: 8,
                borderRadius: 8,
                borderWidth: 2,
                borderColor: focused ? colors.accentText : "transparent",
              })}
            >
              <Text
                style={{ color: colors.accentText }}
                className="font-sans text-sm font-bold"
              >
                {homeCopy.contact}
              </Text>
            </Pressable>
            <Text className="font-sans text-xs leading-5 text-muted-foreground">
              {homeCopy.requestNotice}
            </Text>
          </View>
        }
      />
    </Page>
  );
}
