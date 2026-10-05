import { Text, View } from "react-native";
import { Button, Notice, palette, ui } from "@/components/ui";
import { PublicMenuItem } from "@/lib/api";
import { menuModifiersAreValid, toggleMenuModifier } from "@/lib/menu-options";

export function MenuItemOptions({
  item,
  selectedIds,
  onChange,
  disabled = false,
}: {
  item: PublicMenuItem;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const groups = item.modifierGroups ?? [];
  if (!groups.length) return null;
  const valid = menuModifiersAreValid(groups, selectedIds);
  const money = new Intl.NumberFormat("es-GT", { style: "currency", currency: item.currency });
  return <View style={ui.section}>
    <Text style={{ color: palette.ink, fontWeight: "800" }}>Personaliza tu platillo</Text>
    {groups.map((group) => {
      const groupSelections = selectedIds.filter((id) => group.options.some((option) => option.id === id)).length;
      return <View key={group.id} style={ui.section}>
        <Text style={ui.body}>{group.name} · {group.minSelection === group.maxSelection
          ? `elige ${group.minSelection}` : `elige de ${group.minSelection} a ${group.maxSelection}`}</Text>
        {group.options.map((option) => {
          const selected = selectedIds.includes(option.id);
          const price = option.priceDelta > 0 ? ` · +${money.format(option.priceDelta)}` : "";
          return <Button key={option.id} title={`${selected ? "✓ " : ""}${option.name}${price}`}
            secondary={!selected} disabled={disabled || (!selected && groupSelections >= group.maxSelection)}
            onPress={() => onChange(toggleMenuModifier(groups, selectedIds, option.id))} />;
        })}
        {group.options.length === 0 ? <Notice tone="error">Este platillo requiere opciones que aún no están disponibles. No se puede agregar ahora.</Notice> : null}
      </View>;
    })}
    {!valid ? <Notice>Completa las opciones obligatorias antes de agregar este platillo.</Notice> : null}
  </View>;
}
