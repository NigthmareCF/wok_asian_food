import { Image } from "expo-image";
import { useState } from "react";
import { Text, View } from "react-native";
import { imageUri } from "@/lib/catalog";

export function ProductImage({ reference, name }: { reference?: string | null; name: string }) {
  const uri = imageUri(reference);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  return <View className="h-48 w-full overflow-hidden rounded-md bg-muted">
    {uri && failedUri !== uri ? <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="cover"
      accessible accessibilityLabel={name} recyclingKey={uri} onError={() => setFailedUri(uri)} />
      : <View className="flex-1 items-center justify-center p-4"><Text className="font-sans text-sm text-muted-foreground">Imagen no disponible</Text></View>}
  </View>;
}
