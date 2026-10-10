import { Image } from "expo-image";
import { useState } from "react";
import { Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useUiTheme } from "./ui";
import { imageSource } from "@/lib/catalog";

export function ProductImage({
  reference,
  name,
  compact = false,
}: {
  reference?: string | null;
  name: string;
  compact?: boolean;
}) {
  const source = imageSource(reference);
  const imageKey = reference ?? "";
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const { colors } = useUiTheme();
  return (
    <View
      className={`${compact ? "h-32" : "h-44"} w-full overflow-hidden rounded-md bg-muted`}
    >
      {source && failedUri !== imageKey ? (
        <Image
          source={source}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          accessible
          accessibilityLabel={name}
          recyclingKey={imageKey}
          onError={() => setFailedUri(imageKey)}
        />
      ) : (
        <View className="flex-1 items-center justify-center gap-3 p-4">
          <SymbolView
            name={{
              ios: "fork.knife",
              android: "restaurant",
              web: "restaurant",
            }}
            size={36}
            tintColor={colors.mutedForeground}
          />
          <Text className="font-sans text-sm text-muted-foreground">
            Imagen no disponible
          </Text>
        </View>
      )}
    </View>
  );
}
