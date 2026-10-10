import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, Text } from "react-native";
import { Button, Card, Heading, Notice, Page, Skeleton } from "@/components/ui";
import { ProductImage } from "@/components/product-image";
import { QuantityControl } from "@/components/quantity-control";
import { useCart } from "@/hooks/use-cart";
import { useMenu } from "@/hooks/use-menu";
import { formatPrice, menuProducts } from "@/lib/catalog";

export default function ProductScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const menu = useMenu();
  const cart = useCart();
  const product = menuProducts(menu.data).find((item) => item.id === itemId);
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Page brand>
        <Heading eyebrow="Menú WOK">
          {product?.name ?? "Detalle del platillo"}
        </Heading>
        {menu.isPending ? (
          <Card>
            <Skeleton className="h-48 w-full" />
            <Skeleton />
            <Notice>Cargando el platillo…</Notice>
          </Card>
        ) : null}
        {menu.error ? <Notice tone="error">{menu.error.message}</Notice> : null}
        {!menu.isPending && !menu.error && !product ? (
          <Notice>
            Este platillo ya no aparece en el menú publicado. Revisa el menú
            antes de continuar.
          </Notice>
        ) : null}
        {product ? (
          <Card>
            <ProductImage
              reference={product.imageReference}
              name={product.name}
            />
            <Text className="font-sans text-xl font-extrabold text-primary">
              {formatPrice(product)}
            </Text>
            <Text className="font-sans text-base leading-6 text-muted-foreground">
              {product.description ||
                "Este platillo todavía no tiene una descripción publicada."}
            </Text>
            <QuantityControl
              name={product.name}
              quantity={cart.items[product.id] ?? 0}
              locked={
                !cart.ready ||
                Boolean(cart.attempt) ||
                menu.isFetching ||
                menu.isError
              }
              onChange={(delta) => cart.changeQuantity(product.id, delta)}
            />
            <Text className="font-sans text-sm leading-5 text-muted-foreground">
              El carrito no reserva existencias. El restaurante confirma la
              disponibilidad al revisar tu solicitud.
            </Text>
          </Card>
        ) : null}
        {cart.error ? <Notice tone="error">{cart.error}</Notice> : null}
        {cart.attempt ? (
          <Notice>
            Hay una solicitud sin confirmar. Revisa el carrito antes de
            modificar productos.
          </Notice>
        ) : null}
        <Button title="Ver carrito" onPress={() => router.push("/cart")} />
        <Button
          title="Volver al menú"
          secondary
          onPress={() => router.replace("/(tabs)/menu")}
        />
        <Button
          title="Actualizar menú"
          secondary
          busy={menu.isFetching}
          onPress={() => void menu.refetch()}
        />
      </Page>
    </ScrollView>
  );
}
