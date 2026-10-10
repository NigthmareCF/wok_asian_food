import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Notice,
  Page,
  Skeleton,
  useUiTheme,
} from "@/components/ui";
import { ProductImage } from "@/components/product-image";
import { ProductSheet } from "@/components/product-sheet";
import { useCart } from "@/hooks/use-cart";
import { useMenu } from "@/hooks/use-menu";
import type { PublicMenuItem } from "@/lib/api";
import { cartTotals, formatPrice, menuProducts } from "@/lib/catalog";
import { darkTokens } from "@/theme/tokens";

const focusColor = `rgb(${darkTokens["--focus"].replaceAll(" ", ", ")})`;

type MenuRow =
  | { key: string; kind: "category"; name: string }
  | { key: string; kind: "product"; product: PublicMenuItem };

export default function MenuScreen() {
  const { colors } = useUiTheme();
  const menu = useMenu();
  const cart = useCart();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [selected, setSelected] = useState<PublicMenuItem | null>(null);
  const [focusedCategory, setFocusedCategory] = useState<string | null>(null);
  const count = Object.values(cart.items).reduce(
    (total, quantity) => total + quantity,
    0,
  );
  const totals = cartTotals(menuProducts(menu.data), cart.items);
  const totalLabel =
    totals.length === 1
      ? formatPrice(totals[0])
      : totals.length > 1
        ? "Varias monedas"
        : count
          ? "Revisar precios"
          : formatPrice({ price: 0, currency: "GTQ" });
  const locked =
    !cart.ready || Boolean(cart.attempt) || menu.isFetching || menu.isError;
  const rows = useMemo<MenuRow[]>(
    () =>
      (menu.data?.categories ?? [])
        .filter((category) => !categoryId || category.id === categoryId)
        .flatMap<MenuRow>((category) => {
          const term = search.trim().toLocaleLowerCase("es-GT");
          const items = category.items.filter((product) =>
            `${product.name} ${product.description ?? ""}`
              .toLocaleLowerCase("es-GT")
              .includes(term),
          );
          return items.length
            ? [
                {
                  key: `category:${category.id}`,
                  kind: "category",
                  name: category.name,
                },
                ...items.map((product) => ({
                  key: `product:${category.id}:${product.id}`,
                  kind: "product" as const,
                  product,
                })),
              ]
            : [];
        }),
    [menu.data, search, categoryId],
  );

  function saveSelection(quantity: number, note: string) {
    if (!selected || locked) return;
    cart.changeQuantity(selected.id, quantity - (cart.items[selected.id] ?? 0));
    setSelected(null);
    if (note) router.push({ pathname: "/cart", params: { draftNote: note } });
  }

  return (
    <Page safeTop brand className="gap-2 py-3">
      <View
        className="flex-1 gap-2"
        accessibilityElementsHidden={Boolean(selected)}
        importantForAccessibility={selected ? "no-hide-descendants" : "auto"}
      >
        <Text
          accessibilityRole="header"
          className="font-sans text-xl font-extrabold text-foreground"
        >
          Menú WOK
        </Text>
        <Field
          label="Buscar platillos"
          hideLabel
          density="compact"
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar platillos"
          autoCorrect={false}
          icon={{ ios: "magnifyingglass", android: "search", web: "search" }}
        />
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            {[
              { id: null, name: "Todos" },
              ...(menu.data?.categories ?? []).filter(
                (category) => category.items.length > 0,
              ),
            ].map((category) => (
              <Pressable
                key={category.id ?? "all"}
                accessibilityRole="button"
                accessibilityLabel={category.name}
                accessibilityState={{ selected: categoryId === category.id }}
                onPress={() => setCategoryId(category.id)}
                onFocus={() => setFocusedCategory(category.id ?? "all")}
                onBlur={() => setFocusedCategory(null)}
                style={({ pressed }) => ({
                  opacity: 1,
                  minHeight: 44,
                  minWidth: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor:
                    focusedCategory === (category.id ?? "all")
                      ? focusColor
                      : categoryId === category.id
                        ? colors.primary
                        : colors.border,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  backgroundColor:
                    categoryId === category.id
                      ? pressed
                        ? colors.primaryHover
                        : colors.primary
                      : colors.surface,
                })}
              >
                {categoryId === category.id ? (
                  <Text
                    accessible={false}
                    style={{ color: colors.actionForeground }}
                    className="font-sans text-sm font-bold"
                  >
                    ✓
                  </Text>
                ) : null}
                <Text
                  style={{
                    color:
                      categoryId === category.id
                        ? colors.actionForeground
                        : colors.mutedForeground,
                  }}
                  className={`font-sans text-sm font-bold ${categoryId === category.id ? "text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {category.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          className="flex-1"
          contentContainerClassName="gap-4 pb-4"
          keyboardShouldPersistTaps="handled"
          refreshing={menu.isFetching && !menu.isPending}
          onRefresh={() => void menu.refetch()}
          ListHeaderComponent={
            <View className="gap-3">
              {cart.attempt ? (
                <Notice>
                  Hay una solicitud sin confirmar. Revisa el carrito antes de
                  editar o enviar otra.
                </Notice>
              ) : null}
              {cart.error ? (
                <>
                  <Notice tone="error">{cart.error}</Notice>
                  <Button
                    title="Reintentar carrito"
                    secondary
                    onPress={() => void cart.restore()}
                  />
                </>
              ) : null}
              {menu.error ? (
                <Card>
                  <Notice tone="error">
                    No pudimos cargar el menú, intenta de nuevo.
                  </Notice>
                  <Button
                    title="Reintentar"
                    secondary
                    busy={menu.isFetching}
                    onPress={() => void menu.refetch()}
                  />
                </Card>
              ) : null}
              {menu.isPending ? (
                <Card>
                  <Skeleton className="h-48 w-full" />
                  <Skeleton />
                  <Notice>Cargando el menú oficial…</Notice>
                </Card>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            !menu.isPending && !menu.error ? (
              <EmptyState
                title={
                  search || categoryId
                    ? "No encontramos esos platillos"
                    : "El menú se publicará aquí"
                }
                description={
                  search || categoryId
                    ? "Prueba otra búsqueda o consulta todas las categorías."
                    : "Aún no hay platillos publicados. Vuelve a consultar más tarde."
                }
                icon={{
                  ios: "fork.knife",
                  android: "restaurant",
                  web: "restaurant",
                }}
                action={search || categoryId ? "Ver todos" : "Reintentar"}
                onPress={() => {
                  setSearch("");
                  setCategoryId(null);
                  void menu.refetch();
                }}
              />
            ) : null
          }
          renderItem={({ item }) =>
            item.kind === "category" ? (
              <Text
                accessibilityRole="header"
                className="mt-2 font-sans text-xl font-extrabold text-foreground"
              >
                {item.name}
              </Text>
            ) : (
              <Card>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ver ${item.product.name}`}
                  onPress={() => setSelected(item.product)}
                  className="gap-3 rounded-md focus:ring-2 focus:ring-ring"
                  style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                >
                  <ProductImage
                    reference={item.product.imageReference}
                    name={item.product.name}
                    compact
                  />
                  <Text className="font-sans text-xl font-extrabold text-foreground">
                    {item.product.name}
                  </Text>
                  {item.product.description ? (
                    <Text
                      numberOfLines={3}
                      className="font-sans text-base leading-6 text-muted-foreground"
                    >
                      {item.product.description}
                    </Text>
                  ) : null}
                </Pressable>
                <View className="flex-row flex-wrap items-center justify-between gap-3">
                  <Text className="font-sans text-2xl font-extrabold text-primary">
                    {formatPrice(item.product)}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    {cart.items[item.product.id] ? (
                      <Text
                        accessibilityLiveRegion="polite"
                        className="font-sans text-sm font-bold text-foreground"
                      >
                        {cart.items[item.product.id]} en tu pedido
                      </Text>
                    ) : null}
                    <Button
                      title="+"
                      accessibilityLabel={`Agregar una unidad de ${item.product.name}`}
                      disabled={
                        locked || (cart.items[item.product.id] ?? 0) >= 50
                      }
                      onPress={() => cart.changeQuantity(item.product.id, 1)}
                    />
                  </View>
                </View>
              </Card>
            )
          }
        />
        {count > 0 ? (
          <View className="border-t border-border pt-3">
            <Button
              title={`Ver pedido · ${count} · ${totalLabel}`}
              accessibilityLabel={`Ver pedido, ${count} unidades, ${totalLabel}`}
              onPress={() => router.push("/cart")}
            />
          </View>
        ) : null}
      </View>
      {selected ? (
        <ProductSheet
          key={selected.id}
          product={selected}
          currentQuantity={cart.items[selected.id] ?? 0}
          locked={locked}
          onClose={() => setSelected(null)}
          onSave={saveSelection}
          onDetail={() => {
            const itemId = selected.id;
            setSelected(null);
            router.push({ pathname: "/menu/[itemId]", params: { itemId } });
          }}
        />
      ) : null}
    </Page>
  );
}
