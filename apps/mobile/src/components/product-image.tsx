import { Image } from "expo-image";
import { useState } from "react";
import { Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useUiTheme } from "./ui";
import { imageUri } from "@/lib/catalog";

export function ProductImage({
  reference,
  name,
}: {
  reference?: string | null;
  name: string;
}) {
  const uri = imageUri(reference);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const { colors } = useUiTheme();
  return (
    <View className="h-48 w-full overflow-hidden rounded-md bg-muted">
      {uri && failedUri !== uri ? (
        <Image
          source={{ uri }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          accessible
          accessibilityLabel={name}
          recyclingKey={uri}
          onError={() => setFailedUri(uri)}
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
