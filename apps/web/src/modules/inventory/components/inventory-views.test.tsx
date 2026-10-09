import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { InventorySessionProvider } from "../inventory-session-provider";
import { InventoryDetailView } from "./inventory-detail-view";
import { InventoryListView } from "./inventory-list-view";
afterEach(cleanup);
const item = {
  itemId: "11111111-1111-4111-8111-111111111111",
  sku: "SKU-1",
  name: "Arroz",
  unit: "KG",
  trackInventory: true,
  active: true,
  minimumStock: 2,
  quantityOnHand: 5,
  quantityReserved: 1,
  quantityAvailable: 4,
  status: "OK",
};
const detail = { item, movements: [] };
it("muestra existencias del backend", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([item])));
  render(
    <InventorySessionProvider>
      <InventoryListView />
    </InventorySessionProvider>,
  );
  expect(await screen.findByText("Arroz")).toBeInTheDocument();
});
it("registra movimiento y recarga la existencia", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((url: string) => {
    if (url.includes("/movements"))
      return Promise.resolve(
        Response.json(
          {
            movementId: item.itemId,
            itemId: item.itemId,
            type: "ENTRY",
            quantityDelta: 1,
            quantityOnHand: 6,
            unit: "KG",
            idempotentReplay: false,
          },
          { status: 201 },
        ),
      );
    if (url.includes("/inventory/") && !url.includes("/movements"))
      return Promise.resolve(
        Response.json({
          ...detail,
          item: { ...item, quantityOnHand: 6, quantityAvailable: 5 },
        }),
      );
    return Promise.resolve(Response.json([item]));
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <InventorySessionProvider>
      <InventoryDetailView itemId={item.itemId} />
    </InventorySessionProvider>,
  );
  await screen.findByText("Arroz");
  await user.type(screen.getByLabelText("Cantidad"), "1");
  await user.click(screen.getByRole("button", { name: "Registrar" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "existencias recargadas",
  );
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/movements"),
    expect.objectContaining({ method: "POST" }),
  );
});
