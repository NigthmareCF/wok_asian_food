import { Image } from "expo-image";
import { useState } from "react";
import { Text, View } from "react-native";
import { GradientPanel } from "./gradient-panel";
import { Button, useUiTheme } from "./ui";
import type { PublicMenuItem } from "@/lib/api";
import { formatPrice, imageSource } from "@/lib/catalog";
import { homeCopy } from "@/theme/home-copy";

export function HomeHero({
  product,
  onPress,
}: {
  product: PublicMenuItem | null;
  onPress: () => void;
}) {
  const { colors } = useUiTheme();
  const source = imageSource(product?.imageReference);
  const imageKey = product?.imageReference ?? "";
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showPhoto = source && failedUri !== imageKey;

  return (
    <View
      style={{ height: 280 }}
      className="w-full overflow-hidden rounded-lg border border-border bg-surface"
    >
      {showPhoto ? (
        <Image
          source={source}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          accessible
          accessibilityLabel={product?.name}
          recyclingKey={imageKey}
          onError={() => setFailedUri(imageKey)}
        />
      ) : (
        <GradientPanel variant="warm" fill>
          <View className="items-center pt-5">
            <Image
              source={require("../../assets/images/logo-wok-asian-food.jpg")}
              style={{ width: 72, height: 72, borderRadius: 20 }}
              contentFit="cover"
              accessible
              accessibilityLabel={homeCopy.brandImage}
            />
          </View>
        </GradientPanel>
      )}
      <GradientPanel variant="scrim" fill />
      {/* Opaque backing guarantees text contrast independently of the photograph. */}
      <View
        testID="home-hero-backing"
        style={{ backgroundColor: "#121214" }}
        className="absolute bottom-0 left-0 right-0 gap-1 px-4 pb-4 pt-2 sm:px-6"
      >
        <Text
          style={{ color: colors.accentText }}
          className="font-sans text-xs font-extrabold uppercase tracking-eyebrow"
        >
          {homeCopy.heroLabel}
        </Text>
        <View className="flex-row items-center gap-3">
          <Text
            accessibilityRole="header"
            numberOfLines={product ? 1 : 2}
            style={{ color: colors.foreground, flex: 1 }}
            className="font-sans text-xl font-extrabold sm:text-2xl"
          >
            {product?.name ?? homeCopy.heroFallbackTitle}
          </Text>
          {product ? (
            <Text
              style={{ color: colors.accentText }}
              className="font-sans text-base font-extrabold"
            >
              {formatPrice(product)}
            </Text>
          ) : null}
        </View>
        <Text
          numberOfLines={2}
          style={{ color: colors.mutedForeground }}
          className="font-sans text-xs leading-5"
        >
          {homeCopy.heroSubtitle}
        </Text>
        <View
          style={{ alignSelf: "flex-start", minHeight: 44 }}
          className="pt-1"
        >
          <Button title={homeCopy.orderAction} onPress={onPress} />
        </View>
      </View>
    </View>
  );
}
