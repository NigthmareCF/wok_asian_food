import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveCartProvider } from "@/modules/cart/live-cart-provider";
import { createLiveCartStore } from "@/modules/cart/live-cart-storage";
import { createPickupAttemptStore } from "../pickup-attempt";
import { PickupCheckout } from "./pickup-checkout";

const id = "11111111-1111-4111-8111-111111111111";
const product = {
  id,
  name: "Gyozas",
  price: 68,
  currency: "GTQ",
  estimatedPreparationSeconds: 300,
};
const menu = {
  asOf: new Date().toISOString(),
  categories: [{ id, name: "Platos", items: [product] }],
};
const date = "2099-12-10T12:00";
const receipt = {
  requestId: id,
  status: "PENDING_REVIEW",
  requestedFor: new Date(date).toISOString(),
  subtotal: 68,
  currency: "GTQ",
  idempotentReplay: false,
};
const renderCheckout = () =>
  render(
    <LiveCartProvider>
      <PickupCheckout userId="client-test" />
    </LiveCartProvider>,
  );
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pickup checkout", () => {
  it("submits API identifiers, displays the real pending receipt and clears only submitted cart lines", async () => {
    createLiveCartStore().add(product);
    const fetcher = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(
          Response.json(url === "/bff/menu" ? menu : receipt, {
            status: url === "/bff/menu" ? 200 : 202,
          }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    renderCheckout();
    await screen
      .findByText("Subtotal estimado: Q 68.00", { exact: false })
      .catch(() => screen.findByText(/Subtotal estimado/));
    fireEvent.change(screen.getByLabelText("Fecha y hora para recoger"), {
      target: { value: date },
    });
    await user.click(
      screen.getByRole("button", { name: "Enviar solicitud para recoger" }),
    );
    expect(await screen.findByText("Solicitud registrada")).toBeInTheDocument();
    expect(screen.getByText("Pendiente de revisión")).toBeInTheDocument();
    expect(createLiveCartStore().getSnapshot()).toEqual([]);
    const sent = fetcher.mock.calls.find(
      (call) => call[0] === "/bff/order-requests",
    )!;
    expect(JSON.parse(sent[1].body)).toEqual({
      requestedFor: receipt.requestedFor,
      customerNote: "",
      items: [{ menuItemId: id, quantity: 1 }],
    });
    expect(JSON.parse(sent[1].body)).not.toHaveProperty("subtotal");
  });

  it("reuses the exact key and payload after a lost response and reload", async () => {
    createLiveCartStore().add(product);
    let posts = 0;
    const fetcher = vi.fn().mockImplementation((url: string) => {
      if (url === "/bff/menu") return Promise.resolve(Response.json(menu));
      posts++;
      return posts === 1
        ? Promise.reject(new Error("lost response"))
        : Promise.resolve(
            Response.json(
              { ...receipt, idempotentReplay: true },
              { status: 202 },
            ),
          );
    });
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    const view = renderCheckout();
    await screen.findByText(/Subtotal estimado/);
    fireEvent.change(screen.getByLabelText("Fecha y hora para recoger"), {
      target: { value: date },
    });
    await user.click(
      screen.getByRole("button", { name: "Enviar solicitud para recoger" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Conservamos tu solicitud",
    );
    view.unmount();
    renderCheckout();
    await user.click(
      await screen.findByRole("button", {
        name: "Reintentar la misma solicitud",
      }),
    );
    expect(await screen.findByText("Solicitud registrada")).toBeInTheDocument();
    const requests = fetcher.mock.calls.filter(
      (call) => call[0] === "/bff/order-requests",
    );
    expect(requests).toHaveLength(2);
    expect(requests[0][1].headers["Idempotency-Key"]).toBe(
      requests[1][1].headers["Idempotency-Key"],
    );
    expect(requests[0][1].body).toBe(requests[1][1].body);
    expect(
      createPickupAttemptStore("different-client").getSnapshot(),
    ).toBeNull();
  });

  it("blocks past pickup times without sending or clearing the cart", async () => {
    createLiveCartStore().add(product);
    const fetcher = vi.fn().mockResolvedValue(Response.json(menu));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    renderCheckout();
    await screen.findByText(/Subtotal estimado/);
    fireEvent.change(screen.getByLabelText("Fecha y hora para recoger"), {
      target: { value: "2020-01-01T12:00" },
    });
    await user.click(
      screen.getByRole("button", { name: "Enviar solicitud para recoger" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("horario posterior");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(createLiveCartStore().getSnapshot()).toHaveLength(1);
  });
});
