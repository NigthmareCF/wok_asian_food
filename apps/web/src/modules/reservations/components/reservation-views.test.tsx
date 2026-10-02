import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientSessionProvider } from "@/modules/clients/client-session-provider";
import { createClientSessionStore } from "@/modules/clients/client-session";
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

const renderClient = (view: React.ReactNode) =>
  render(
    <ClientSessionProvider store={createClientSessionStore()}>
      {view}
    </ClientSessionProvider>,
  );

describe("ReservationFormView", () => {
  it("shows the late reservation notice for the C-08 demonstration time", () => {
    renderClient(<ReservationFormView initialTime="21:30" />);

    expect(screen.getByLabelText("HORA")).toHaveValue("21:30");
    expect(
      screen.getByRole("heading", {
        name: "Solicitud tardía: después de las 21:15.",
      }),
    ).toBeInTheDocument();
  });

  it("validates the preorder selection before continuing", async () => {
    const user = userEvent.setup();
    renderClient(<ReservationFormView />);

    await user.click(screen.getByRole("button", { name: "CONTINUAR" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Indica si deseas incluir preorden.",
    );
  });

  it("sends the preorder choice to the temporary menu access", () => {
    renderClient(<ReservationFormView />);

    expect(screen.getByRole("link", { name: "Sí" })).toHaveAttribute(
      "href",
      "/menu",
    );
    expect(
      screen.getByText(/podrás seleccionar platillos en el menú/),
    ).toBeInTheDocument();
  });

  it("keeps the no-preorder choice in the reservation flow", async () => {
    const user = userEvent.setup();
    renderClient(<ReservationFormView />);

    await user.click(screen.getByRole("button", { name: "Ahora no" }));
    await user.click(screen.getByRole("button", { name: "CONTINUAR" }));

    expect(
      screen.getByText("Solicitud de reserva pendiente de validación"),
    ).toBeInTheDocument();
  });

  it("increases and decreases the number of people", async () => {
    const user = userEvent.setup();
    renderClient(<ReservationFormView />);

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
    renderClient(<ReservationFormView />);

    fireEvent.change(screen.getByLabelText("HORA"), {
      target: { value: "21:15" },
    });

    expect(
      screen.queryByText(/Solicitud tardía: después de las/),
    ).not.toBeInTheDocument();
  });

  it("shows C-08 after 21:15 and allows choosing 21:15", async () => {
    const user = userEvent.setup();
    renderClient(<ReservationFormView />);

    const timeInput = screen.getByLabelText("HORA");
    fireEvent.change(timeInput, { target: { value: "21:30" } });

    expect(
      screen.getByRole("heading", {
        name: "Solicitud tardía: después de las 21:15.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Las solicitudes tardías están sujetas a disponibilidad y validación del restaurante. Registrar la solicitud no garantiza su aceptación.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "La solicitud tardía requiere preorden para la validación del restaurante. Puedes registrar la solicitud aunque esté pendiente; incluirla no garantiza aceptación.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "USAR 21:15" }));

    expect(screen.getByLabelText("HORA")).toHaveValue("21:15");
    expect(screen.getByRole("link", { name: "Sí" })).toHaveAttribute(
      "href",
      "/menu",
    );
    expect(
      screen.queryByText(/Solicitud tardía: después de las/),
    ).not.toBeInTheDocument();
  });

  it("returns focus to the time selector when choosing another time", async () => {
    const user = userEvent.setup();
    renderClient(<ReservationFormView />);

    fireEvent.change(screen.getByLabelText("HORA"), {
      target: { value: "21:30" },
    });
    await user.click(screen.getByRole("button", { name: "ELEGIR OTRA HORA" }));

    expect(screen.getByLabelText("HORA")).toHaveFocus();
    expect(
      screen.queryByText(/Solicitud tardía: después de las/),
    ).not.toBeInTheDocument();
  });

  it("does not show C-08 for a time before 21:15", () => {
    renderClient(<ReservationFormView />);

    fireEvent.change(screen.getByLabelText("HORA"), {
      target: { value: "20:30" },
    });

    expect(
      screen.queryByText(/Solicitud tardía: después de las/),
    ).not.toBeInTheDocument();
  });

  it("shows a simulated pending confirmation for a valid request", async () => {
    const user = userEvent.setup();
    renderClient(<ReservationFormView />);

    await user.click(screen.getByRole("button", { name: "Ahora no" }));
    await user.click(screen.getByRole("button", { name: "CONTINUAR" }));

    const pendingConfirmation = screen.getByText(
      "Solicitud de reserva pendiente de validación",
    );
    expect(pendingConfirmation).toBeInTheDocument();
    expect(pendingConfirmation.parentElement?.parentElement).toHaveTextContent(
      "Guardada localmente",
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
