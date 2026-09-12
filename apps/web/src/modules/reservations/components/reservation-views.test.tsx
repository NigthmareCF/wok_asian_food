import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TableSessionProvider } from "@/modules/tables";
import { ReservationSessionProvider } from "../reservation-session-provider";
import { NewReservationView } from "./new-reservation-view";
import { ReservationListView } from "./reservation-list-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(cleanup);

const renderReservations = (view: React.ReactNode) =>
  render(
    <TableSessionProvider>
      <ReservationSessionProvider>{view}</ReservationSessionProvider>
    </TableSessionProvider>,
  );

describe("Reservation views", () => {
  it("filters the agenda by status and customer", async () => {
    const user = userEvent.setup();
    renderReservations(<ReservationListView />);

    await user.click(screen.getByRole("button", { name: "Vencida" }));
    expect(screen.getByText("Mario Estrada")).toBeInTheDocument();
    expect(screen.queryByText("Ana Ruiz")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Todas" }));
    await user.type(screen.getByRole("searchbox"), "Valeria");
    expect(screen.getByText("Valeria Gómez")).toBeInTheDocument();
    expect(screen.queryByText("Ana Ruiz")).not.toBeInTheDocument();
  });

  it("requires preorder and human confirmation for a late reservation", async () => {
    const user = userEvent.setup();
    renderReservations(<NewReservationView />);

    await user.type(screen.getByLabelText("Nombre del cliente"), "Luis Pérez");
    await user.type(screen.getByLabelText("Teléfono"), "55550000");
    await user.clear(screen.getByLabelText("Hora"));
    await user.type(screen.getByLabelText("Hora"), "21:30");
    await user.selectOptions(screen.getByLabelText("Mesa sugerida"), "1");
    await user.click(
      screen.getByLabelText("Disponibilidad revisada por una persona"),
    );

    const confirm = screen.getByRole("button", {
      name: "Confirmar reservación",
    });
    expect(confirm).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Después de las 21:15 se requiere preorden.",
    );

    await user.click(screen.getByLabelText("La reservación incluye preorden"));
    expect(confirm).toBeEnabled();
  });
});
