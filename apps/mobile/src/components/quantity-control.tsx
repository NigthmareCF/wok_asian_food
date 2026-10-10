import { Text, View } from "react-native";
import { Button } from "./ui";

export function QuantityControl({
  name,
  quantity,
  locked,
  onChange,
  minimum = 0,
}: {
  name: string;
  quantity: number;
  locked: boolean;
  onChange: (delta: number) => void;
  minimum?: number;
}) {
  return (
    <View className="flex-row flex-wrap items-center gap-3">
      <Button
        title="−"
        secondary
        accessibilityLabel={`Quitar una unidad de ${name}`}
        disabled={locked || quantity <= minimum}
        onPress={() => onChange(-1)}
      />
      <Text
        accessibilityLabel={`${quantity} unidades de ${name}`}
        accessibilityLiveRegion="polite"
        className="min-w-11 text-center font-sans text-xl font-extrabold text-foreground"
      >
        {quantity}
      </Text>
      <Button
        title="+"
        accessibilityLabel={`Agregar una unidad de ${name}`}
        disabled={locked || quantity >= 50}
        onPress={() => onChange(1)}
      />
    </View>
  );
}
