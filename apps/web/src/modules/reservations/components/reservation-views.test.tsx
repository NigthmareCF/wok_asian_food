import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TableSessionProvider } from "@/modules/tables";
import { ReservationSessionProvider } from "../reservation-session-provider";
import { NewReservationView } from "./new-reservation-view";
import { ReservationFormView } from "./reservation-form-view";
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

describe("ReservationFormView", () => {
  it("validates the preorder selection before continuing", async () => {
    const user = userEvent.setup();
    render(<ReservationFormView />);

    await user.click(screen.getByRole("button", { name: "CONTINUAR" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Indica si deseas incluir preorden.",
    );
  });

  it("increases and decreases the number of people", async () => {
    const user = userEvent.setup();
    render(<ReservationFormView />);

    await user.click(
      screen.getByRole("button", { name: "Aumentar número de personas" }),
    );
    expect(screen.getByText("5", { selector: "output" })).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Reducir número de personas" }),
    );
    expect(screen.getByText("4", { selector: "output" })).toBeInTheDocument();
  });

  it("keeps 21:15 as a valid time without showing the late notice", () => {
    render(<ReservationFormView />);

    fireEvent.change(screen.getByLabelText("HORA"), {
      target: { value: "21:15" },
    });

    expect(
      screen.queryByText(/La última hora disponible para ingreso/),
    ).not.toBeInTheDocument();
  });

  it("shows C-08 for a time after 21:15 and uses 21:15 with preorder", async () => {
    const user = userEvent.setup();
    render(<ReservationFormView />);

    const timeInput = screen.getByLabelText("HORA");
    fireEvent.change(timeInput, { target: { value: "22:00" } });

    expect(
      screen.getByRole("heading", {
        name: "La última hora disponible para ingreso es 21:15.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Para esta hora se requiere preorden completa y confirmación del restaurante.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("El preorden es obligatorio para esta hora."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "USAR 21:15" }));

    expect(screen.getByLabelText("HORA")).toHaveValue("21:15");
    expect(screen.getByRole("button", { name: "Sí" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByText(/La última hora disponible para ingreso/),
    ).not.toBeInTheDocument();
  });

  it("returns focus to the time selector when choosing another time", async () => {
    const user = userEvent.setup();
    render(<ReservationFormView />);

    fireEvent.change(screen.getByLabelText("HORA"), {
      target: { value: "22:00" },
    });
    await user.click(screen.getByRole("button", { name: "ELEGIR OTRA HORA" }));

    expect(screen.getByLabelText("HORA")).toHaveFocus();
    expect(
      screen.queryByText(/La última hora disponible para ingreso/),
    ).not.toBeInTheDocument();
  });

  it("does not show C-08 for a time before 21:15", () => {
    render(<ReservationFormView />);

    fireEvent.change(screen.getByLabelText("HORA"), {
      target: { value: "20:30" },
    });

    expect(
      screen.queryByText(/La última hora disponible para ingreso/),
    ).not.toBeInTheDocument();
  });

  it("shows a simulated pending confirmation for a valid request", async () => {
    const user = userEvent.setup();
    render(<ReservationFormView />);

    await user.click(screen.getByRole("button", { name: "Sí" }));
    await user.click(screen.getByRole("button", { name: "CONTINUAR" }));

    const pendingConfirmation = screen.getByText(
      "Solicitud pendiente de confirmación",
    );
    expect(pendingConfirmation).toBeInTheDocument();
    expect(pendingConfirmation.parentElement?.parentElement).toHaveTextContent(
      "Esta es una simulación",
    );
  });
});

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
