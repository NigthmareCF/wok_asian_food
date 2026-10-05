<<<<<<< HEAD
import * as SecureStore from "expo-secure-store";
import { Link } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { Button, Card, Field, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { useSession } from "@/providers/session-provider";
import { ApiError, apiRequest, PickupRequestBody, PickupRequestReceipt, PublicMenu, PublicMenuItem } from "@/lib/api";
=======
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
>>>>>>> 9997cf0e (fix(mobile): adjust BFF, add cart/menu flows, UI components, hooks and tests)

type MenuRow = { key: string; kind: "category"; name: string } | { key: string; kind: "product"; product: PublicMenuItem };

export default function MenuScreen() {
<<<<<<< HEAD
  const { session, request } = useSession();
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartRestored, setCartRestored] = useState(Platform.OS === "web");
  const [requestedFor, setRequestedFor] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [attempt, setAttempt] = useState<PickupAttempt | null>(null);
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState<PickupRequestReceipt | null>(null);

  const loadMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setMenu(await apiRequest<PublicMenu>("/api/v1/public/menu")); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "No pudimos cargar el menú."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let mounted = true;
    apiRequest<PublicMenu>("/api/v1/public/menu")
      .then((result) => { if (mounted) setMenu(result); })
      .catch((cause: unknown) => { if (mounted) setError(cause instanceof ApiError ? cause.message : "No pudimos cargar el menú."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (Platform.OS === "web") return;
    Promise.all([SecureStore.getItemAsync(cartStorageKey), SecureStore.getItemAsync(attemptStorageKey)])
      .then(([storedCart, storedAttempt]) => {
        if (!mounted) return;
        if (storedCart) {
          try { setCart(validCart(JSON.parse(storedCart) as unknown)); }
          catch { void SecureStore.deleteItemAsync(cartStorageKey); }
        }
        if (storedAttempt) {
          try {
            const value = JSON.parse(storedAttempt) as PickupAttempt;
            if (value.email && value.key && value.body?.items?.length) setAttempt(value);
            else void SecureStore.deleteItemAsync(attemptStorageKey);
          } catch { void SecureStore.deleteItemAsync(attemptStorageKey); }
        }
      })
      .finally(() => { if (mounted) setCartRestored(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!cartRestored || Platform.OS === "web") return;
    void SecureStore.setItemAsync(cartStorageKey, JSON.stringify(cart));
  }, [cart, cartRestored]);

  const products = useMemo(() => (menu?.categories ?? []).flatMap((category) => category.items), [menu]);
  const cartItems = products.filter((item) => (cart[item.id] ?? 0) > 0);
  const cartCount = cartItems.reduce((total, item) => total + cart[item.id], 0);
  const cartSubtotal = cartItems.reduce((total, item) => total + item.price * cart[item.id], 0);
  const hasItems = (menu?.categories ?? []).some((category) => category.items.length > 0);

  function changeQuantity(item: PublicMenuItem, delta: number) {
    setReceipt(null);
    setCart((current) => {
      const next = { ...current };
      const quantity = (next[item.id] ?? 0) + delta;
      if (quantity <= 0) delete next[item.id];
      else if (quantity <= 50) next[item.id] = quantity;
      return next;
    });
  }

  function suggestPickupTime() {
    const preparationSeconds = cartItems.reduce((total, item) => total + item.estimatedPreparationSeconds * cart[item.id], 0);
    const leadSeconds = Math.max(15 * 60, preparationSeconds + 60);
    const serverTime = Date.parse(menu?.asOf ?? "");
    if (!Number.isNaN(serverTime)) setRequestedFor(localDateTime(new Date(serverTime + leadSeconds * 1000)));
  }

  async function submitPickup() {
    if (!session) { setError("Inicia sesión para enviar una solicitud de pickup."); return; }
    if (attempt && attempt.email !== session.email) {
      setError(`Hay una solicitud anterior sin confirmar para ${attempt.email}. Inicia esa cuenta para reintentarla antes de enviar otra.`);
      return;
    }
    const activeAttempt = attempt ?? {
      email: session.email,
      key: createIdempotencyKey(),
      body: {
        requestedFor: new Date(requestedFor).toISOString(),
        customerNote: customerNote.trim() || undefined,
        items: cartItems.map((item) => ({ menuItemId: item.id, quantity: cart[item.id] })),
      },
    };
    if (!activeAttempt.body.items.length) { setError("Agrega al menos un producto."); return; }
    if (Number.isNaN(Date.parse(activeAttempt.body.requestedFor))) { setError("Revisa la fecha y hora solicitadas."); return; }
    setError(null);
    setSending(true);
    try {
      if (Platform.OS !== "web") await SecureStore.setItemAsync(attemptStorageKey, JSON.stringify(activeAttempt));
      const result = await request<PickupRequestReceipt>("/api/v1/client/order-requests", {
        method: "POST",
        headers: { "Idempotency-Key": activeAttempt.key },
        body: JSON.stringify(activeAttempt.body),
      });
      if (Platform.OS !== "web") {
        await Promise.all([SecureStore.deleteItemAsync(attemptStorageKey), SecureStore.deleteItemAsync(cartStorageKey)]);
      }
      setAttempt(null);
      setReceipt(result);
      setCart({});
      setCustomerNote("");
    } catch (cause) {
      setAttempt(activeAttempt);
      setError(cause instanceof ApiError ? cause.message : "No pudimos confirmar el resultado. Reintenta la misma solicitud.");
    } finally { setSending(false); }
  }

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <Heading eyebrow="Catálogo">Menú WOK</Heading>
    {attempt ? <Card>
      <Notice>Solicitud sin confirmar para {attempt.email}. Reintenta esta misma solicitud antes de editarla o enviar otra.</Notice>
      {session?.email === attempt.email ? <Button title="Reintentar solicitud pendiente" onPress={() => void submitPickup()} busy={sending} />
        : <View style={ui.section}><Text style={ui.body}>Inicia sesión con esa cuenta para consultar el mismo resultado de forma segura.</Text><Link href="/account" style={ui.link}>Ir a Mi cuenta</Link></View>}
    </Card> : null}
    {loading ? <Card><Text style={ui.body}>Cargando el menú oficial…</Text></Card> : null}
    {error ? <View style={ui.section}><Notice tone="error">{error}</Notice>{!hasItems ? <Button title="Reintentar menú" secondary onPress={() => void loadMenu()} /> : null}</View> : null}
    {receipt ? <Notice tone="success">Solicitud {receipt.requestId.slice(0, 8)} recibida. Estado: pendiente de revisión. Aún no es un pedido aceptado ni se ha cobrado.</Notice> : null}
    {!loading && !error && !hasItems ? <>
      <Card><Text style={{ fontWeight: "800", color: palette.ink, fontSize: 18 }}>El menú se publicará aquí</Text>
        <Text style={ui.body}>Aún no hay platillos publicados. Los productos y precios aparecerán cuando el restaurante cargue su catálogo oficial.</Text>
      </Card>
      <Notice>No mostramos datos de ejemplo como si fueran productos reales.</Notice>
    </> : null}
    {!loading && !error && hasItems ? (menu?.categories ?? []).filter((category) => category.items.length > 0).map((category) =>
      <View key={category.id} style={ui.section}>
        <Text accessibilityRole="header" style={{ color: palette.ink, fontSize: 20, fontWeight: "800" }}>{category.name}</Text>
        {category.items.map((item) => <Card key={item.id}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <Text style={{ flex: 1, color: palette.ink, fontSize: 17, fontWeight: "800" }}>{item.name}</Text>
            <Text style={{ color: palette.red, fontWeight: "800" }}>{formatPrice(item)}</Text>
          </View>
          {item.description ? <Text style={ui.body}>{item.description}</Text> : null}
          <View style={ui.row}>
            <Button title="−" secondary disabled={!cart[item.id]} onPress={() => changeQuantity(item, -1)} />
            <Text accessibilityLiveRegion="polite" style={{ color: palette.ink, fontWeight: "800" }}>{cart[item.id] ?? 0}</Text>
            <Button title="Agregar" onPress={() => changeQuantity(item, 1)} disabled={Boolean(attempt)} />
          </View>
        </Card>)}
      </View>,
    ) : null}
    {hasItems && cartCount > 0 ? <View style={ui.section}>
      <Heading eyebrow="Solicitud">Pickup · {cartCount} productos</Heading>
      <Card>
        {cartItems.map((item) => <View key={item.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <Text style={{ flex: 1, color: palette.ink }}>{cart[item.id]} × {item.name}</Text>
          <Text style={{ color: palette.ink, fontWeight: "700" }}>{formatPrice({ ...item, price: item.price * cart[item.id] })}</Text>
        </View>)}
        <Text style={{ color: palette.ink, fontWeight: "800" }}>Subtotal actual: {new Intl.NumberFormat("es-GT", { style: "currency", currency: cartItems[0].currency }).format(cartSubtotal)}</Text>
        <Text style={ui.body}>El backend vuelve a validar precios. El carrito no reserva inventario ni confirma un pedido.</Text>
        <Button title="Sugerir primera hora" secondary onPress={suggestPickupTime} disabled={Boolean(attempt)} />
        <Field label="Fecha y hora solicitadas (hora local)" value={requestedFor} onChangeText={setRequestedFor} placeholder="AAAA-MM-DDTHH:mm" editable={!attempt} />
        <Field label="Comentarios (opcional)" value={attempt?.body.customerNote ?? customerNote} onChangeText={setCustomerNote} placeholder="Indicaciones para el equipo" editable={!attempt} maxLength={500} />
        {!session ? <View style={ui.section}><Notice>Para enviar tu solicitud, primero inicia sesión.</Notice><Link href="/account" style={ui.link}>Ir a Mi cuenta</Link></View> : null}
        {session?.offline ? <Notice>Estás sin conexión. La solicitud requiere confirmación del servidor y no se enviará automáticamente.</Notice> : null}
        {attempt ? <Notice>Hay un envío cuyo resultado no se confirmó. Reintenta exactamente la misma solicitud; la app conserva su clave para evitar duplicados.</Notice> : null}
        <Button title={attempt ? "Reintentar solicitud pendiente" : "Enviar solicitud de pickup"}
          onPress={() => void submitPickup()} busy={sending} disabled={!session || (session.offline && !process.env.EXPO_PUBLIC_API_BASE_URL)} />
      </Card>
    </View> : null}
  </Page></ScrollView>;
=======
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
>>>>>>> 9997cf0e (fix(mobile): adjust BFF, add cart/menu flows, UI components, hooks and tests)
}
