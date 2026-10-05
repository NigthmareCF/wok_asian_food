import { Text, View } from "react-native";
import { Button } from "./ui";

export function QuantityControl({ name, quantity, locked, onChange }: {
  name: string; quantity: number; locked: boolean; onChange: (delta: number) => void;
}) {
  return <View className="flex-row flex-wrap items-center gap-3">
    <Button title="−" secondary accessibilityLabel={`Quitar una unidad de ${name}`} disabled={locked || quantity === 0} onPress={() => onChange(-1)} />
    <Text accessibilityLabel={`${quantity} unidades de ${name}`} accessibilityLiveRegion="polite" className="font-sans text-base font-bold text-foreground">{quantity}</Text>
    <Button title="Agregar" accessibilityLabel={`Agregar una unidad de ${name}`} disabled={locked || quantity >= 50} onPress={() => onChange(1)} />
  </View>;
}
