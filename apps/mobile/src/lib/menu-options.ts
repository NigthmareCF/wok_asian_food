import { MenuModifierGroup, PublicMenuItem } from "./api";

export function toggleMenuModifier(
  groups: MenuModifierGroup[] = [],
  currentIds: string[],
  modifierId: string,
): string[] {
  if (currentIds.includes(modifierId)) return currentIds.filter((id) => id !== modifierId);
  const group = groups.find((item) => item.options.some((option) => option.id === modifierId));
  if (!group) return currentIds;
  const selectedInGroup = currentIds.filter((id) => group.options.some((option) => option.id === id)).length;
  if (selectedInGroup >= group.maxSelection) {
    if (group.maxSelection !== 1) return currentIds;
    const groupOptionIds = new Set(group.options.map((option) => option.id));
    return [...currentIds.filter((id) => !groupOptionIds.has(id)), modifierId];
  }
  return [...currentIds, modifierId];
}

export function menuModifiersAreValid(groups: MenuModifierGroup[] = [], selectedIds: string[] = []): boolean {
  const knownIds = new Set(groups.flatMap((group) => group.options.map((option) => option.id)));
  if (selectedIds.some((id) => !knownIds.has(id)) || new Set(selectedIds).size !== selectedIds.length) return false;
  return groups.every((group) => {
    const count = selectedIds.filter((id) => group.options.some((option) => option.id === id)).length;
    return count >= group.minSelection && count <= group.maxSelection;
  });
}

export function menuItemUnitPrice(item: PublicMenuItem, selectedIds: string[] = []): number {
  const options = (item.modifierGroups ?? []).flatMap((group) => group.options);
  return item.price + options.filter((option) => selectedIds.includes(option.id))
    .reduce((total, option) => total + option.priceDelta, 0);
}
