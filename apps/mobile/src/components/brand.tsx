import { Image } from "expo-image";
import { Text, View } from "react-native";

export function Brand({
  compact = false,
  discreet = false,
}: {
  compact?: boolean;
  discreet?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Image
        source={require("../../assets/images/logo-wok-asian-food.jpg")}
        contentFit="cover"
        accessibilityLabel="WOK Asian Food"
        accessible
        style={{
          width: discreet ? 32 : compact ? 40 : 56,
          height: discreet ? 32 : compact ? 40 : 56,
          borderRadius: 16,
        }}
      />
      <View className="flex-1 gap-1">
        <Text
          className={`font-sans font-extrabold tracking-eyebrow text-foreground ${discreet ? "text-xs" : "text-base"}`}
        >
          WOK ASIAN FOOD
        </Text>
        {!compact ? (
          <Text className="font-sans text-xs text-muted-foreground">
            Sabor para compartir
          </Text>
        ) : null}
      </View>
    </View>
  );
}
