import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { InventorySessionProvider, useInventorySession } from "./inventory-session-provider";

const itemId = "11111111-1111-4111-8111-111111111111";
function Controls() {
  const inventory = useInventorySession();
  return <>
    {inventory.error && <p role="alert">{inventory.error}</p>}
    <button onClick={() => {
      void inventory.recordMovement(itemId, "ENTRY", 1);
      void inventory.recordMovement(itemId, "ENTRY", 1);
    }}>Registrar dos veces</button>
    <button onClick={() => void inventory.recordMovement(itemId, "ENTRY", 1)}>Reintentar</button>
    <button onClick={() => void inventory.recordMovement(itemId, "ENTRY", 2)}>Cambiar</button>
  </>;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("prevents reentrant writes and preserves the exact key and payload after an uncertain response", async () => {
  const writes: RequestInit[] = [];
  let complete!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method !== "POST") return Promise.resolve(Response.json([]));
    writes.push(init);
    return writes.length === 1 ? new Promise<Response>((resolve) => { complete = resolve; }) :
      Promise.resolve(Response.json({ movementId: itemId, itemId, type: "ENTRY",
        quantityDelta: 1, quantityOnHand: 6, unit: "KG", idempotentReplay: true }));
  }));
  render(<InventorySessionProvider><Controls /></InventorySessionProvider>);
  const user = userEvent.setup();
  await user.click(screen.getByText("Registrar dos veces"));
  expect(writes).toHaveLength(1);
  complete(Response.json({ message: "Resultado desconocido" }, { status: 503 }));
  await screen.findByRole("alert");
  await user.click(screen.getByText("Cambiar"));
  expect(writes).toHaveLength(1);
  expect(screen.getByRole("alert")).toHaveTextContent("mismos datos");
  await user.click(screen.getByText("Reintentar"));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1].body).toBe(writes[0].body);
  expect(new Headers(writes[1].headers).get("Idempotency-Key")).toBe(new Headers(writes[0].headers).get("Idempotency-Key"));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
});
