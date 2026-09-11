import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkoutPreviewSnapshot } from "@/data/fixtures/checkout-preview";
import { formatQuetzales, getCheckoutTotalCents } from "../checkout-snapshot";
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
  it("renders the snapshot summary with prices stored in cents", () => {
    render(
      <CheckoutView actions={actions} snapshot={checkoutPreviewSnapshot} />,
    );

    expect(
      screen.getByText("Wok teriyaki", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText("Q385.00")).toBeInTheDocument();
    expect(formatQuetzales(38500)).toBe("Q385.00");
    expect(getCheckoutTotalCents(checkoutPreviewSnapshot)).toBe(38500);
  });

  it("runs the local simulated revalidation action", async () => {
    const user = userEvent.setup();
    render(
      <CheckoutView actions={actions} snapshot={checkoutPreviewSnapshot} />,
    );

    await user.click(
      screen.getByRole("button", { name: "REVALIDAR SOLICITUD" }),
    );
    expect(actions.onRevalidate).toHaveBeenCalledOnce();
  });

  it("shows the simulated pending request and its demo tracking link", async () => {
    const user = userEvent.setup();
    render(<CheckoutPreview />);

    await user.click(screen.getByRole("button", { name: "CONFIRMAR PAGO" }));
    expect(
      screen.getByText("Solicitud pendiente simulada"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "VER SEGUIMIENTO DE DEMOSTRACIÓN" }),
    ).toHaveAttribute("href", "/client/orders/demo-190");
    expect(screen.getByText(/no procesó el pago/)).toBeInTheDocument();
  });
});
