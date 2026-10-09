import { describe, expect, it } from "vitest";
import { MenuModifierGroup, PublicMenuItem } from "./api";
import { menuItemUnitPrice, menuModifiersAreValid, toggleMenuModifier } from "./menu-options";

const groups: MenuModifierGroup[] = [{
  id: "group-1", name: "Proteína", minSelection: 1, maxSelection: 1, required: true, displayOrder: 0,
  options: [
    { id: "chicken", name: "Pollo", priceDelta: 0 },
    { id: "tofu", name: "Tofu", priceDelta: 5 },
  ],
}];

const item: PublicMenuItem = {
  id: "item-1", name: "Wok", price: 30, currency: "GTQ", estimatedPreparationSeconds: 600,
  displayOrder: 0, modifierGroups: groups,
};

describe("menu modifier choices", () => {
  it("replaces the selected option in a single-choice group", () => {
    expect(toggleMenuModifier(groups, ["chicken"], "tofu")).toEqual(["tofu"]);
    expect(toggleMenuModifier(groups, ["chicken"], "chicken")).toEqual([]);
    expect(toggleMenuModifier(groups, [], "tofu")).toEqual(["tofu"]);
  });

  it("does not exceed a multi-choice group's maximum", () => {
    const multiChoice: MenuModifierGroup[] = [{
      ...groups[0], minSelection: 0, maxSelection: 2,
      options: [
        ...groups[0].options,
        { id: "beef", name: "Res", priceDelta: 0 },
      ],
    }];

    expect(toggleMenuModifier(multiChoice, ["chicken", "tofu"], "beef")).toEqual(["chicken", "tofu"]);
  });

  it("requires configured minimum and maximum selection counts", () => {
    expect(menuModifiersAreValid(groups, [])).toBe(false);
    expect(menuModifiersAreValid(groups, ["chicken"])).toBe(true);
    expect(menuModifiersAreValid(groups, ["chicken", "tofu"])).toBe(false);
    expect(menuModifiersAreValid(groups, ["unknown"])).toBe(false);
  });

  it("calculates only the displayed per-unit option delta", () => {
    expect(menuItemUnitPrice(item, ["chicken"])).toBe(30);
    expect(menuItemUnitPrice(item, ["tofu"])).toBe(35);
  });
});
