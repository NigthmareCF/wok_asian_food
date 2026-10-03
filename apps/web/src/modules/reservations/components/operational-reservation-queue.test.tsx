import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OperationalReservationQueue } from "./operational-reservation-queue";

const reservationId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const pendingReservation = {
  id: reservationId,
  guests: 4,
  reservationAt: "2026-12-01T20:00:00Z",
  estimatedEndAt: "2026-12-01T22:00:00Z",
  notes: "Cerca de la ventana",
  rowVersion: 1,
  customerName: "Ana Ruiz",
  email: "ana@example.com",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("crypto", { randomUUID: () => requestId });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("loads pending reservations and sends a versioned confirmation", async () => {
  const user = userEvent.setup();
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json([pendingReservation]))
    .mockResolvedValueOnce(
      Response.json({
        reservationId,
        decision: "CONFIRM",
        status: "CONFIRMED",
        rowVersion: 2,
        reason: "Capacidad disponible",
      }),
    )
    .mockResolvedValueOnce(Response.json([]));

  render(<OperationalReservationQueue />);

  expect(await screen.findByText("Ana Ruiz")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Confirmar" }));
  await user.type(
    screen.getByLabelText("Motivo de la decisiÃ³n"),
    "Capacidad disponible",
  );
  await user.click(screen.getByRole("button", { name: "Confirmar solicitud" }));

  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Solicitud confirmada.",
    ),
  );
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    `/bff/operational/reservations/${reservationId}/decision`,
    expect.objectContaining({
      method: "PUT",
      headers: expect.objectContaining({ "X-Request-Id": requestId }),
      body: JSON.stringify({
        decision: "CONFIRM",
        reason: "Capacidad disponible",
        expectedVersion: 1,
      }),
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByText("No hay solicitudes pendientes"),
    ).toBeInTheDocument(),
  );
});

it("reloads the queue after a 409 without overwriting another decision", async () => {
  const user = userEvent.setup();
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json([pendingReservation]))
    .mockResolvedValueOnce(
      Response.json({ message: "El estado cambiÃ³." }, { status: 409 }),
    )
    .mockResolvedValueOnce(Response.json([]));

  render(<OperationalReservationQueue />);

  await screen.findByText("Ana Ruiz");
  await user.click(screen.getByRole("button", { name: "Rechazar" }));
  await user.type(screen.getByLabelText("Motivo de la decisiÃ³n"), "Sin cupo");
  await user.click(screen.getByRole("button", { name: "Rechazar solicitud" }));

  expect(
    await screen.findByText(/no sobrescribir otra decisiÃ³n/i),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.getByText("No hay solicitudes pendientes"),
    ).toBeInTheDocument(),
  );
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("shows an error state and allows reloading the pending queue", async () => {
  const user = userEvent.setup();
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      Response.json({ message: "Sin permiso." }, { status: 403 }),
    )
    .mockResolvedValueOnce(Response.json([]));

  render(<OperationalReservationQueue />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Sin permiso.");
  await user.click(screen.getByRole("button", { name: "Actualizar cola" }));
  expect(
    await screen.findByText("No hay solicitudes pendientes"),
  ).toBeInTheDocument();
});
