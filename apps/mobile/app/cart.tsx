import {CoreQuote,type QuoteSelection} from "@/components/core-quote";
import {quoteSelectionMatches} from "@/lib/quote-selection";
import { randomUUID } from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { FlatList, Text, View } from "react-native";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Heading,
  Notice,
  Page,
} from "@/components/ui";
import { ProductImage } from "@/components/product-image";
import { QuantityControl } from "@/components/quantity-control";
import { ReservationDateTime } from "@/components/reservation-date-time";
import {
  restaurantInstant,
  pickupTimeError,
  suggestPickup,
} from "@/lib/slot-time";
import { useCart } from "@/hooks/use-cart";
import { useMenu } from "@/hooks/use-menu";
import { ApiError, PickupRequestReceipt } from "@/lib/api";
import {
  cartTotals,
  formatPrice,
  menuProducts,
  pickupReceiptSchema,
} from "@/lib/catalog";
import { useSession } from "@/providers/session-provider";

const statusLabels: Record<PickupRequestReceipt["status"], string> = {
  PENDING_REVIEW: "pendiente de revisión",
  ACCEPTED: "aceptada",
  REJECTED: "rechazada",
  CANCELLED: "cancelada",
  EXPIRED: "expirada",
};

export default function CartScreen() {
  const { draftNote } = useLocalSearchParams<{ draftNote?: string }>();
  const cart = useCart();
  const menu = useMenu();
  const { session, ready: sessionReady, request } = useSession();
  const [requestedFor, setRequestedFor] = useState("");
  const [selection,setSelection]=useState<QuoteSelection|null>(null);
  const [selectionNow, setSelectionNow] = useState(() => Date.now());
  const [customerNote, setCustomerNote] = useState(
    typeof draftNote === "string" ? draftNote.slice(0, 500) : "",
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<PickupRequestReceipt | null>(null);
  const [receiptOwner, setReceiptOwner] = useState<string | null>(null);
  const sendingLock = useRef(false);
  const products = useMemo(() => menuProducts(menu.data), [menu.data]);
  const entries = Object.entries(cart.items).map(([id, quantity]) => ({
    id,
    quantity,
    product: products.find((item) => item.id === id),
  }));
  const totals = cartTotals(products, cart.items);
  const count = Object.values(cart.items).reduce(
    (total, quantity) => total + quantity,
    0,
  );
  const missingProducts = entries.some((entry) => !entry.product);
  const pendingOwned = cart.attempt?.email === session?.email;
  const canEdit = cart.ready && !cart.attempt && !sending;
  const currentMenu = menu.isSuccess && !menu.isError && !menu.isFetching;
  const preparation = products.reduce(
    (total, item) =>
      total + item.estimatedPreparationSeconds * (cart.items[item.id] ?? 0),
    0,
  );

  function suggestPickupTime() {
    setSelectionNow(Date.now());
    setRequestedFor(suggestPickup(Date.now(), preparation, menu.data?.asOf));
  }
  async function submitPickup() {
    if (sendingLock.current) return;
    if (!session || !sessionReady) {
      setError("Inicia sesión para enviar tu solicitud.");
      return;
    }
    if (!cart.ready) {
      setError("Espera mientras recuperamos el carrito.");
      return;
    }
    if (cart.attempt && !pendingOwned) {
      setError(
        "Hay una solicitud sin confirmar de otra cuenta. Vuelve con esa cuenta para reintentarla.",
      );
      return;
    }
    if (
      !cart.attempt &&
      (!currentMenu || missingProducts || totals.length !== 1)
    ) {
      setError(
        "Actualiza el menú y revisa los productos y su moneda antes de enviar.",
      );
      return;
    }
    const instant = restaurantInstant(requestedFor);
    if (!cart.attempt && !quoteSelectionMatches(selection,{ownerEmail:session.email,items:entries.map(({id,quantity})=>({menuItemId:id,quantity})),requestedFor:instant??"",fulfillment:"PICKUP"})) {
      setError("Cotiza y acepta el resultado del servidor antes de continuar.");
      return;
    }
    const timeError = pickupTimeError(requestedFor, Date.now(), preparation);
    if (!cart.attempt && timeError) {
      setError(timeError);
      return;
    }
    if (!cart.attempt && !entries.length) {
      setError("Agrega al menos un platillo.");
      return;
    }
    if (!cart.attempt && entries.length > 20) {
      setError(
        "El restaurante acepta hasta 20 platillos diferentes por solicitud. Revisa el carrito.",
      );
      return;
    }
    sendingLock.current = true;
    setSending(true);
    setError("");
    setReceipt(null);
    let attemptKey: string | null = null;
    try {
      const attempt = cart.attempt ?? {
        email: session.email,
        key: randomUUID(),
        body: {
          requestedFor: instant!,
          customerNote: customerNote.trim() || undefined,
          items: selection!.items,
          quoteId: selection!.quoteId,
        },
      };
      attemptKey = attempt.key;
      await cart.prepareAttempt(attempt);
      const response = await request<unknown>("/api/v1/client/order-requests", {
        method: "POST",
        headers: { "Idempotency-Key": attempt.key },
        body: JSON.stringify(attempt.body),
      });
      const parsed = pickupReceiptSchema.safeParse(response);
      if (!parsed.success)
        throw new ApiError(
          "El servidor no devolvió una confirmación válida.",
          503,
        );
      const result = parsed.data;
      await cart.completeAttempt(attempt.key);
      setReceipt(result);
      setReceiptOwner(session.email);
      setCustomerNote("");
      setRequestedFor("");
    } catch (cause) {
      if (
        attemptKey &&
        cause instanceof ApiError &&
        cause.status &&
        [400, 413, 415, 422, 429].includes(cause.status)
      ) {
        try {
          await cart.releaseRejectedAttempt(attemptKey, cause.status);
        } catch {
          setError(
            "La solicitud fue rechazada, pero no pudimos actualizar el borrador. Reintenta la misma solicitud.",
          );
          return;
        }
      }
      setError(
        cause instanceof ApiError
          ? cause.message
          : "No pudimos confirmar el resultado. Conservamos la solicitud para reintentarla sin duplicados.",
      );
    } finally {
      sendingLock.current = false;
      setSending(false);
    }
  }

  return (
    <Page brand>
      <FlatList
        data={entries}
        keyExtractor={(entry) => entry.id}
        className="flex-1"
        contentContainerClassName="gap-4 pb-6"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View className="gap-4">
            <Heading eyebrow="Tu selección">Tu pedido · {count}</Heading>
            {!cart.ready && !cart.error ? (
              <Notice>Recuperando tu carrito…</Notice>
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
            {menu.isPending ? (
              <Notice>Consultando precios publicados…</Notice>
            ) : null}
            {menu.error ? (
              <Notice tone="error">{menu.error.message}</Notice>
            ) : null}
            {error ? <Notice tone="error">{error}</Notice> : null}
            {receipt && receiptOwner === session?.email ? (
              <Notice>
                Solicitud {receipt.requestId.slice(0, 8)}:{" "}
                {statusLabels[receipt.status]}. No se ha procesado ningún cobro.
              </Notice>
            ) : null}
            {cart.attempt ? (
              <Card>
                <Notice>
                  Hay una solicitud cuyo resultado no se confirmó. No se enviará
                  automáticamente al recuperar conexión.
                </Notice>
                {pendingOwned ? (
                  <Button
                    title="Reintentar la misma solicitud"
                    busy={sending}
                    onPress={() => void submitPickup()}
                  />
                ) : (
                  <Button
                    title="Ir a Mi cuenta"
                    secondary
                    onPress={() => router.push("/(tabs)/account")}
                  />
                )}
              </Card>
            ) : null}
            <Button
              title="Seguir explorando el menú"
              secondary
              onPress={() => router.push("/(tabs)/menu")}
            />
            <Button
              title="Actualizar precios"
              secondary
              busy={menu.isFetching}
              onPress={() => void menu.refetch()}
            />
          </View>
        }
        ListEmptyComponent={
          cart.ready ? (
            <EmptyState
              title="Tu próximo antojo te espera"
              description="Todavía no agregaste platillos. Explora el menú para armar tu pedido."
              icon={{
                ios: "bag",
                android: "shopping_bag",
                web: "shopping_bag",
              }}
              action="Explorar menú"
              onPress={() => router.push("/(tabs)/menu")}
            />
          ) : null
        }
        renderItem={({ item: entry }) => (
          <Card>
            {entry.product ? (
              <>
                <ProductImage
                  reference={entry.product.imageReference}
                  name={entry.product.name}
                />
                <Text className="font-sans text-lg font-extrabold text-foreground">
                  {entry.product.name}
                </Text>
                <Text className="font-sans text-2xl font-extrabold text-primary">
                  {formatPrice({
                    ...entry.product,
                    price: entry.product.price * entry.quantity,
                  })}
                </Text>
                <QuantityControl
                  name={entry.product.name}
                  quantity={entry.quantity}
                  locked={!canEdit}
                  onChange={(delta) => {
                    setReceipt(null);
                    cart.changeQuantity(entry.id, delta);
                  }}
                />
                <Button
                  title="Ver detalle"
                  secondary
                  onPress={() =>
                    router.push({
                      pathname: "/menu/[itemId]",
                      params: { itemId: entry.id },
                    })
                  }
                />
              </>
            ) : (
              <>
                <Text className="font-sans text-base font-bold text-foreground">
                  {entry.quantity} unidades ·{" "}
                  {currentMenu
                    ? "Platillo ya no publicado"
                    : "Platillo pendiente de comprobar"}
                </Text>
                <Notice>
                  {currentMenu
                    ? "Este platillo ya no está publicado. Retíralo antes de enviar una nueva solicitud."
                    : "Actualiza el menú para comprobar este platillo."}
                </Notice>
                <Button
                  title="Quitar del carrito"
                  secondary
                  disabled={!canEdit}
                  onPress={() => cart.changeQuantity(entry.id, -entry.quantity)}
                />
              </>
            )}
          </Card>
        )}
        ListFooterComponent={
          entries.length > 0 ? (
            <Card>
              {totals.map((total) => (
                <Text
                  key={total.currency}
                  className="font-sans text-lg font-extrabold text-foreground"
                >
                  Subtotal orientativo: {formatPrice(total)}
                </Text>
              ))}
              <Text className="font-sans text-base leading-6 text-muted-foreground">
                El servidor valida precios, existencias y horario. El carrito no
                reserva inventario ni confirma un pedido.
              </Text>
              {!cart.attempt ? (
                <>
                  <Text className="font-sans text-lg font-extrabold text-foreground">
                    Pasar a recoger
                  </Text>
                  <Button
                    title="Sugerir primera hora"
                    secondary
                    disabled={!canEdit || !currentMenu || missingProducts}
                    onPress={suggestPickupTime}
                  />
                  <ReservationDateTime
                    title="¿Cuándo quieres recoger tu pedido?"
                    value={requestedFor}
                    onChange={(value) => {
                      setSelectionNow(Date.now());
                      setRequestedFor(value);
                    }}
                    disabled={!canEdit}
                    earliest={selectionNow + preparation * 1000 + 1}
                    helper="El tiempo depende de tus platillos. Enviar no confirma el horario; el restaurante revisará la solicitud."
                  />
                  <Field
                    label="Comentarios para tu pedido (opcional)"
                    value={customerNote}
                    onChangeText={setCustomerNote}
                    editable={canEdit}
                    multiline
                    maxLength={500}
                  />
                  {!session ? (
                    <Button
                      title="Iniciar sesión para solicitar pickup"
                      secondary
                      onPress={() => router.push("/(tabs)/account")}
                    />
                  ) : null}
                  {session?.offline ? (
                    <Notice>
                      La solicitud requiere conexión y confirmación del
                      servidor. No se enviará automáticamente.
                    </Notice>
                  ) : null}
                  <CoreQuote items={entries.map(({id,quantity})=>({menuItemId:id,quantity}))}
                    requestedFor={restaurantInstant(requestedFor)??""} fulfillment="PICKUP" onSelection={setSelection}/>
                  <Button
                    title="Enviar solicitud de pickup"
                    busy={sending}
                    disabled={
                      !session ||
                      !sessionReady ||
                      !cart.ready ||
                      !currentMenu ||
                      missingProducts ||
                      totals.length !== 1
                    }
                    onPress={() => void submitPickup()}
                  />
                </>
              ) : null}
            </Card>
          ) : null
        }
      />
    </Page>
  );
}
