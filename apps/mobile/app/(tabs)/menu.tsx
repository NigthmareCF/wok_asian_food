import { router } from "expo-router";
import { useMemo } from "react";
import { FlatList, Text, View } from "react-native";
import { Button, Card, Heading, Notice, Page, Skeleton } from "@/components/ui";
import { ProductImage } from "@/components/product-image";
import { QuantityControl } from "@/components/quantity-control";
import { useCart } from "@/hooks/use-cart";
import { useMenu } from "@/hooks/use-menu";
import type { PublicMenuItem } from "@/lib/api";
import { formatPrice } from "@/lib/catalog";

type MenuRow = { key: string; kind: "category"; name: string } | { key: string; kind: "product"; product: PublicMenuItem };

export default function MenuScreen() {
  const menu = useMenu();
  const cart = useCart();
  const count = Object.values(cart.items).reduce((total, quantity) => total + quantity, 0);
  const rows = useMemo<MenuRow[]>(() => (menu.data?.categories ?? [])
    .filter((category) => category.items.length > 0)
    .flatMap<MenuRow>((category) => [
      { key: `category:${category.id}`, kind: "category", name: category.name },
      ...category.items.map((product) => ({ key: `product:${category.id}:${product.id}`, kind: "product" as const, product })),
    ]), [menu.data]);
  return <Page safeTop>
    <FlatList data={rows} keyExtractor={(item) => item.key} className="flex-1" contentContainerClassName="gap-4 pb-6"
      refreshing={menu.isFetching && !menu.isPending} onRefresh={() => void menu.refetch()}
      ListHeaderComponent={<View className="gap-4">
        <Heading eyebrow="Catálogo">Menú WOK</Heading>
        <Text className="font-sans text-base leading-6 text-muted-foreground">Explora los platillos publicados por el restaurante.</Text>
        <Button title={`Ver carrito · ${count} productos`} onPress={() => router.push("/cart")} />
        {cart.attempt ? <Notice>Hay una solicitud sin confirmar. Revisa el carrito antes de editar o enviar otra.</Notice> : null}
        {cart.error ? <><Notice tone="error">{cart.error}</Notice><Button title="Reintentar carrito" secondary onPress={() => void cart.restore()} /></> : null}
        {menu.error ? <Notice tone="error">{menu.error.message}</Notice> : null}
        {menu.isPending ? <Card><Skeleton className="h-48 w-full" /><Skeleton /><Notice>Cargando el menú oficial…</Notice></Card> : null}
        <Button title="Actualizar menú" secondary busy={menu.isFetching} onPress={() => void menu.refetch()} />
      </View>}
      ListEmptyComponent={!menu.isPending && !menu.error ? <Card>
        <Text className="font-sans text-xl font-extrabold text-foreground">El menú se publicará aquí</Text>
        <Text className="font-sans text-base leading-6 text-muted-foreground">Aún no hay platillos publicados. No mostramos productos de ejemplo como si fueran reales.</Text>
      </Card> : null}
      renderItem={({ item }) => item.kind === "category"
        ? <Text accessibilityRole="header" className="mt-2 font-sans text-xl font-extrabold text-foreground">{item.name}</Text>
        : <Card>
          <ProductImage reference={item.product.imageReference} name={item.product.name} />
          <View className="flex-row flex-wrap items-start justify-between gap-3">
            <Text className="flex-1 font-sans text-lg font-extrabold text-foreground">{item.product.name}</Text>
            <Text className="font-sans text-base font-extrabold text-primary">{formatPrice(item.product)}</Text>
          </View>
          {item.product.description ? <Text numberOfLines={3} className="font-sans text-base leading-6 text-muted-foreground">{item.product.description}</Text> : null}
          <Button title="Ver detalle" accessibilityLabel={`Ver detalle de ${item.product.name}`} secondary
            onPress={() => router.push({ pathname: "/menu/[itemId]", params: { itemId: item.product.id } })} />
          <QuantityControl name={item.product.name} quantity={cart.items[item.product.id] ?? 0}
            locked={!cart.ready || Boolean(cart.attempt) || menu.isFetching || menu.isError}
            onChange={(delta) => cart.changeQuantity(item.product.id, delta)} />
        </Card>}
    />
  </Page>;
}
