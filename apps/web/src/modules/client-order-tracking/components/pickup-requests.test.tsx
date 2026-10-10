import { clientIdentityStore } from "@/modules/clients/client-identity-store";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PickupHistory } from "./pickup-history";
import { PickupRequestDetail } from "./pickup-request-detail";
const id = "11111111-1111-4111-8111-111111111111";
const receipt = {
  requestId: id,
  status: "PENDING_REVIEW",
  requestedFor: "2026-10-03T18:00:00Z",
  subtotal: 68,
  currency: "GTQ",
  orderId: null,
  orderStatus: null,
  idempotentReplay: false,
};
const details = {
  ...receipt,
  customerNote: "Nota de prueba",
  items: [
    {
      name: "Gyozas",
      quantity: 1,
      unitPrice: 68,
      lineTotal: 68,
      currencyId: id,
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("pickup history", () => {
  it("renders real links and statuses, then refreshes from the API", async () => {
    installFetch(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json([receipt]))
        .mockResolvedValueOnce(
          Response.json([{ ...receipt, status: "CANCELLED" }]),
        ),
    );
    const user = userEvent.setup();
    render(<PickupHistory />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
    expect(
      await screen.findByRole("link", { name: new RegExp(id) }),
    ).toHaveAttribute("href", `/client/orders/${id}`);
    await user.click(
      screen.getByRole("button", { name: "Actualizar solicitudes" }),
    );
    expect(await screen.findByText("Cancelada")).toBeInTheDocument();
  });
  it("retries a failed history and shows a genuine empty state", async () => {
    installFetch(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("network"))
        .mockResolvedValueOnce(Response.json([])),
    );
    const user = userEvent.setup();
    render(<PickupHistory />);
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(
      await screen.findByText("Aún no tienes solicitudes para recoger"),
    ).toBeInTheDocument();
  });
});
describe("pickup detail", () => {
  it("requires explicit confirmation and displays cancellation only after API confirmation", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(details))
      .mockResolvedValueOnce(
        Response.json({ requestId: id, status: "CANCELLED" }),
      )
      .mockResolvedValueOnce(
        Response.json({ ...details, status: "CANCELLED" }),
      );
    installFetch("fetch", fetcher);
    const user = userEvent.setup();
    render(<PickupRequestDetail requestId={id} />);
    await screen.findByRole("heading", { name: "Gyozas" });
    await user.click(
      screen.getByRole("button", { name: "Cancelar solicitud" }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: "Conservar solicitud" }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: "Cancelar solicitud" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Sí, cancelar solicitud" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Cancelada" }),
    ).toBeInTheDocument();
    expect(screen.getByText("La solicitud fue cancelada.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancelar solicitud" }),
    ).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `/bff/order-requests/${id}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });
  it("refreshes a concurrent 409 without claiming cancellation", async () => {
    installFetch(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(details))
        .mockResolvedValueOnce(
          Response.json({ message: "Cambió de estado" }, { status: 409 }),
        )
        .mockResolvedValueOnce(
          Response.json({ ...details, status: "ACCEPTED" }),
        ),
    );
    const user = userEvent.setup();
    render(<PickupRequestDetail requestId={id} />);
    await user.click(
      await screen.findByRole("button", {
        name: "Cancelar solicitud",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Sí, cancelar solicitud" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Aceptada" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Cambió de estado");
    expect(
      screen.queryByText("La solicitud fue cancelada."),
    ).not.toBeInTheDocument();
  });
  it("shows the kitchen status after the restaurant accepts the request", async () => {
    installFetch(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ...details,
          status: "ACCEPTED",
          orderId: id,
          orderStatus: "READY",
        }),
      ),
    );
    render(<PickupRequestDetail requestId={id} />);
    expect(
      await screen.findByText("Listo para recoger", { selector: "strong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tu pedido está listo para recoger/),
    ).toBeInTheDocument();
  });
  it.each([401, 404])(
    "shows a private access error without leaking detail (%s)",
    async (status) => {
      installFetch(
        "fetch",
        vi.fn().mockResolvedValue(
          Response.json(
            {
              message:
                status === 401
                  ? "Inicia sesión"
                  : "No encontramos esa solicitud en tu cuenta.",
            },
            { status },
          ),
        ),
      );
      render(<PickupRequestDetail requestId={id} />);
      if (status === 401)
        await waitFor(() =>
          expect(clientIdentityStore.getSnapshot().status).toBe("unverified"),
        );
      else await screen.findByRole("alert");
      expect(
        screen.queryByRole("heading", { name: "Gyozas" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "Cancelar solicitud",
        }),
      ).not.toBeInTheDocument();
      if (status === 401)
        expect(
          screen.getByRole("link", { name: "Iniciar sesión" }),
        ).toBeInTheDocument();
    },
  );
});

function installFetch(_name: string, fetcher: typeof fetch) {
  vi.stubGlobal("fetch", (url: RequestInfo | URL, options?: RequestInit) =>
    url === "/bff/auth/session"
      ? Promise.resolve(Response.json({ user: { userId: "client-test" } }))
      : fetcher(url, options),
  );
}
beforeEach(async () => {
  installFetch("fetch", vi.fn());
  await clientIdentityStore.refresh();
});
