import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCheckoutPreviewSnapshot } from "@/data/fixtures/checkout-preview";
import { getSafeCheckoutService } from "../checkout-snapshot";
import { CheckoutPreview } from "./checkout-preview";
import { CheckoutView } from "./checkout-view";

afterEach(cleanup);

const actions = {
  onPaymentTimingChange: vi.fn(),
  onPaymentMethodChange: vi.fn(),
  onTipChange: vi.fn(),
  onRevalidate: vi.fn(),
  onConfirm: vi.fn(),
};

describe("CheckoutView", () => {
  it.each([
    ["table", "Consumo en mesa"],
    ["pickup", "Para recoger"],
    ["delivery", "Delivery"],
  ] as const)("identifies the %s service", (service, label) => {
    render(
      <CheckoutView
        actions={actions}
        snapshot={createCheckoutPreviewSnapshot(service)}
      />,
    );

    expect(screen.getByText(`Tipo de servicio: ${label}`)).toBeInTheDocument();
  });

  it("keeps table service free of prices, payment controls and tips", () => {
    render(
      <CheckoutView
        actions={actions}
        snapshot={createCheckoutPreviewSnapshot("table")}
      />,
    );

    expect(
      screen.getByText("Wok teriyaki", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Q385.00/)).not.toBeInTheDocument();
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
    expect(screen.queryByText("MÉTODO DE PAGO")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Pagar ahora|Pagar en mesa|PROPINA/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ENVIAR SOLICITUD" }),
    ).toBeInTheDocument();
  });

  it.each(["pickup", "delivery"] as const)(
    "shows authorized client payment details for %s",
    (service) => {
      render(
        <CheckoutView
          actions={actions}
          snapshot={createCheckoutPreviewSnapshot(service)}
        />,
      );

      expect(screen.getByText("Q385.00")).toBeInTheDocument();
      expect(screen.getByText("Total")).toBeInTheDocument();
      expect(screen.getByText("MÉTODO DE PAGO")).toBeInTheDocument();
      expect(screen.queryByText(/PROPINA/)).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "CONFIRMAR SOLICITUD" }),
      ).toBeInTheDocument();
    },
  );

  it("uses table as the safe service for an unknown query", () => {
    expect(getSafeCheckoutService("unsupported")).toBe("table");
    expect(getSafeCheckoutService(undefined)).toBe("table");
  });

  it("renders demo service routes and marks the active service", () => {
    render(
      <CheckoutView
        actions={actions}
        snapshot={createCheckoutPreviewSnapshot("pickup")}
      />,
    );

    [
      ["Consumo en mesa", "/client/checkout?service=table"],
      ["Para recoger", "/client/checkout?service=pickup"],
      ["Delivery", "/client/checkout?service=delivery"],
    ].forEach(([label, href]) => {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        href,
      );
    });
    expect(screen.getByRole("link", { name: "Para recoger" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows a pending simulated request without claiming payment or confirmation", async () => {
    const user = userEvent.setup();
    render(<CheckoutPreview service="table" />);

    await user.click(screen.getByRole("button", { name: "ENVIAR SOLICITUD" }));
    expect(screen.getByText("Solicitud pendiente")).toBeInTheDocument();
    expect(
      screen.getByText(/solicitud permanece pendiente/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/pago|pedido confirmado/i),
    ).not.toBeInTheDocument();
  });
});
