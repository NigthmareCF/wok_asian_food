import { useRef, useState } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProductImage } from "./product-image";
import { QuantityControl } from "./quantity-control";
import { Button, Field, Notice, useUiTheme } from "./ui";
import type { PublicMenuItem } from "@/lib/api";
import { formatPrice } from "@/lib/catalog";

export function ProductSheet({
  product,
  currentQuantity,
  locked,
  onClose,
  onSave,
  onDetail,
}: {
  product: PublicMenuItem;
  currentQuantity: number;
  locked: boolean;
  onClose: () => void;
  onSave: (quantity: number, note: string) => void;
  onDetail: () => void;
}) {
  const { colors } = useUiTheme();
  const insets = useSafeAreaInsets();
  const heading = useRef<Text>(null);
  const [quantity, setQuantity] = useState(currentQuantity || 1);
  const [note, setNote] = useState("");

  function focusHeading() {
    if (Platform.OS !== "web") {
      const handle = findNodeHandle(heading.current);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      onShow={focusHeading}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end bg-background/80"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar detalle del platillo"
          onPress={onClose}
          className="absolute inset-0"
        />
        <View
          accessibilityViewIsModal
          className="mx-auto max-h-[90%] w-full max-w-2xl rounded-t-lg border border-border bg-surface"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <View className="items-center pt-3">
            <View
              accessible={false}
              className="h-1 w-12 rounded-md bg-border"
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="gap-4 p-5"
          >
            <View className="flex-row items-start gap-3">
              <Text
                ref={heading}
                accessible
                accessibilityRole="header"
                className="flex-1 font-sans text-2xl font-extrabold text-foreground"
              >
                {product.name}
              </Text>
              <Button title="Cerrar" secondary onPress={onClose} />
            </View>
            <ProductImage
              reference={product.imageReference}
              name={product.name}
            />
            <Text className="font-sans text-2xl font-extrabold text-primary">
              {formatPrice(product)}
            </Text>
            <Text className="font-sans text-base leading-6 text-muted-foreground">
              {product.description ||
                "Este platillo todavía no tiene una descripción publicada."}
            </Text>
            <Text className="font-sans text-base font-bold text-foreground">
              Cantidad en tu pedido
            </Text>
            <QuantityControl
              name={product.name}
              quantity={quantity}
              locked={locked}
              minimum={1}
              onChange={(delta) =>
                setQuantity((value) => Math.max(1, Math.min(50, value + delta)))
              }
            />
            <Field
              label="Comentarios para tu pedido (opcional)"
              multiline
              maxLength={500}
              value={note}
              onChangeText={setNote}
              editable={!locked}
              placeholder="Cuéntanos si debemos tener algo en cuenta"
            />
            <Text className="font-sans text-xs leading-5 text-muted-foreground">
              El comentario es general para el pedido, no una modificación de
              ingredientes. Podrás revisarlo en el carrito.
            </Text>
            {locked ? (
              <Notice>
                No puedes editar mientras recuperamos el menú o hay una
                solicitud sin confirmar.
              </Notice>
            ) : null}
            <Button
              title={`Guardar selección · ${formatPrice({ ...product, price: product.price * quantity })}`}
              disabled={locked}
              onPress={() => onSave(quantity, note.trim())}
            />
            <Button title="Ver detalle completo" secondary onPress={onDetail} />
            <Text
              style={{
                color: colors.mutedForeground,
                fontSize: 12,
                lineHeight: 18,
              }}
            >
              El restaurante valida disponibilidad y precios al revisar la
              solicitud.
            </Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
