import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Button, Card, Field, Heading, Notice, Page } from "@/components/ui";
import { ProductImage } from "@/components/product-image";
import { QuantityControl } from "@/components/quantity-control";
import { useCart } from "@/hooks/use-cart";
import { useMenu } from "@/hooks/use-menu";
import { ApiError, PickupRequestReceipt } from "@/lib/api";
import { cartTotals, formatPrice, menuProducts, pickupReceiptSchema } from "@/lib/catalog";
import { useSession } from "@/providers/session-provider";

function localDateTime(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
const statusLabels: Record<PickupRequestReceipt["status"], string> = {
  PENDING_REVIEW: "pendiente de revisión", ACCEPTED: "aceptada", REJECTED: "rechazada", CANCELLED: "cancelada", EXPIRED: "expirada",
};

export default function CartScreen() {
  const cart = useCart();
  const menu = useMenu();
  const { session, ready: sessionReady, request } = useSession();
  const [requestedFor, setRequestedFor] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<PickupRequestReceipt | null>(null);
  const [receiptOwner, setReceiptOwner] = useState<string | null>(null);
  const sendingLock = useRef(false);
  const products = useMemo(() => menuProducts(menu.data), [menu.data]);
  const entries = Object.entries(cart.items).map(([id, quantity]) => ({ id, quantity, product: products.find((item) => item.id === id) }));
  const totals = cartTotals(products, cart.items);
  const count = Object.values(cart.items).reduce((total, quantity) => total + quantity, 0);
  const missingProducts = entries.some((entry) => !entry.product);
  const pendingOwned = cart.attempt?.email === session?.email;
  const canEdit = cart.ready && !cart.attempt && !sending;
  const currentMenu = menu.isSuccess && !menu.isError && !menu.isFetching;

  function suggestPickupTime() {
    const preparation = products.reduce((total, item) => total + item.estimatedPreparationSeconds * (cart.items[item.id] ?? 0), 0);
    const serverTime = Date.parse(menu.data?.asOf ?? "");
    if (!Number.isNaN(serverTime)) setRequestedFor(localDateTime(new Date(serverTime + Math.max(15 * 60, preparation + 60) * 1000)));
  }
  async function submitPickup() {
    if (sendingLock.current) return;
    if (!session || !sessionReady) { setError("Inicia sesión para enviar tu solicitud."); return; }
    if (!cart.ready) { setError("Espera mientras recuperamos el carrito."); return; }
    if (cart.attempt && !pendingOwned) { setError("Hay una solicitud sin confirmar de otra cuenta. Vuelve con esa cuenta para reintentarla."); return; }
    if (!cart.attempt && (!currentMenu || missingProducts || totals.length !== 1)) {
      setError("Actualiza el menú y revisa los productos y su moneda antes de enviar."); return;
    }
    const date = new Date(requestedFor);
    if (!cart.attempt && Number.isNaN(date.getTime())) { setError("Revisa la fecha y hora solicitadas."); return; }
    if (!cart.attempt && !entries.length) { setError("Agrega al menos un platillo."); return; }
    sendingLock.current = true; setSending(true); setError(""); setReceipt(null);
    let attemptKey: string | null = null;
    try {
      const attempt = cart.attempt ?? {
        email: session.email, key: randomUUID(), body: {
          requestedFor: date.toISOString(), customerNote: customerNote.trim() || undefined,
          items: entries.map(({ id, quantity }) => ({ menuItemId: id, quantity })),
        },
      };
      attemptKey = attempt.key;
      await cart.prepareAttempt(attempt);
      const response = await request<unknown>("/api/v1/client/order-requests", {
        method: "POST", headers: { "Idempotency-Key": attempt.key }, body: JSON.stringify(attempt.body),
      });
      const parsed = pickupReceiptSchema.safeParse(response);
      if (!parsed.success) throw new ApiError("El servidor no devolvió una confirmación válida.", 503);
      const result = parsed.data;
      await cart.completeAttempt(attempt.key);
      setReceipt(result); setReceiptOwner(session.email); setCustomerNote(""); setRequestedFor("");
    } catch (cause) {
      if (attemptKey && cause instanceof ApiError && cause.status && [400, 413, 415, 422, 429].includes(cause.status)) {
        try { await cart.releaseRejectedAttempt(attemptKey, cause.status); }
        catch { setError("La solicitud fue rechazada, pero no pudimos actualizar el borrador. Reintenta la misma solicitud."); return; }
      }
      setError(cause instanceof ApiError ? cause.message : "No pudimos confirmar el resultado. Conservamos la solicitud para reintentarla sin duplicados.");
    } finally { sendingLock.current = false; setSending(false); }
  }

  return <Page>
    <FlatList data={entries} keyExtractor={(entry) => entry.id} className="flex-1" contentContainerClassName="gap-4 pb-6" keyboardShouldPersistTaps="handled"
      ListHeaderComponent={<View className="gap-4">
        <Heading eyebrow="Tu selección">Carrito · {count} productos</Heading>
        {!cart.ready && !cart.error ? <Notice>Recuperando tu carrito…</Notice> : null}
        {cart.error ? <><Notice tone="error">{cart.error}</Notice><Button title="Reintentar carrito" secondary onPress={() => void cart.restore()} /></> : null}
        {menu.isPending ? <Notice>Consultando precios publicados…</Notice> : null}
        {menu.error ? <Notice tone="error">{menu.error.message}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {receipt && receiptOwner === session?.email ? <Notice>Solicitud {receipt.requestId.slice(0, 8)}: {statusLabels[receipt.status]}. No se ha procesado ningún cobro.</Notice> : null}
        {cart.attempt ? <Card><Notice>Hay una solicitud cuyo resultado no se confirmó. No se enviará automáticamente al recuperar conexión.</Notice>
          {pendingOwned ? <Button title="Reintentar la misma solicitud" busy={sending} onPress={() => void submitPickup()} />
            : <Button title="Ir a Mi cuenta" secondary onPress={() => router.push("/(tabs)/account")} />}
        </Card> : null}
        <Button title="Seguir explorando el menú" secondary onPress={() => router.push("/(tabs)/menu")} />
        <Button title="Actualizar precios" secondary busy={menu.isFetching} onPress={() => void menu.refetch()} />
      </View>}
      ListEmptyComponent={cart.ready ? <Card><Text className="font-sans text-base text-muted-foreground">Tu carrito está vacío. Agrega platillos desde el menú.</Text></Card> : null}
      renderItem={({ item: entry }) => <Card>
        {entry.product ? <>
          <ProductImage reference={entry.product.imageReference} name={entry.product.name} />
          <Text className="font-sans text-lg font-extrabold text-foreground">{entry.product.name}</Text>
          <Text className="font-sans text-base font-bold text-primary">{formatPrice({ ...entry.product, price: entry.product.price * entry.quantity })}</Text>
          <QuantityControl name={entry.product.name} quantity={entry.quantity} locked={!canEdit}
            onChange={(delta) => { setReceipt(null); cart.changeQuantity(entry.id, delta); }} />
          <Button title="Ver detalle" secondary onPress={() => router.push({ pathname: "/menu/[itemId]", params: { itemId: entry.id } })} />
        </> : <>
          <Text className="font-sans text-base font-bold text-foreground">{entry.quantity} unidades · {currentMenu ? "Platillo ya no publicado" : "Platillo pendiente de comprobar"}</Text>
          <Notice>{currentMenu ? "Este platillo ya no está publicado. Retíralo antes de enviar una nueva solicitud." : "Actualiza el menú para comprobar este platillo."}</Notice>
          <Button title="Quitar del carrito" secondary disabled={!canEdit} onPress={() => cart.changeQuantity(entry.id, -entry.quantity)} />
        </>}
      </Card>}
      ListFooterComponent={entries.length > 0 ? <Card>
        {totals.map((total) => <Text key={total.currency} className="font-sans text-lg font-extrabold text-foreground">Subtotal orientativo: {formatPrice(total)}</Text>)}
        <Text className="font-sans text-base leading-6 text-muted-foreground">El servidor valida precios, existencias y horario. El carrito no reserva inventario ni confirma un pedido.</Text>
        {!cart.attempt ? <>
          <Button title="Sugerir primera hora" secondary disabled={!canEdit || !currentMenu || missingProducts} onPress={suggestPickupTime} />
          <Field label="Fecha y hora solicitadas (hora local)" value={requestedFor} onChangeText={setRequestedFor} placeholder="AAAA-MM-DDTHH:mm" editable={canEdit} />
          <Field label="Comentarios (opcional)" value={customerNote} onChangeText={setCustomerNote} editable={canEdit} maxLength={500} />
          {!session ? <Button title="Iniciar sesión para solicitar pickup" secondary onPress={() => router.push("/(tabs)/account")} /> : null}
          {session?.offline ? <Notice>La solicitud requiere conexión y confirmación del servidor. No se enviará automáticamente.</Notice> : null}
          <Button title="Enviar solicitud de pickup" busy={sending} disabled={!session || !sessionReady || !cart.ready || !currentMenu || missingProducts || totals.length !== 1} onPress={() => void submitPickup()} />
        </> : null}
      </Card> : null}
    />
  </Page>;
}
