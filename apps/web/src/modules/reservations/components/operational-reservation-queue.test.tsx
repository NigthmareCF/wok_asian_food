import { installPrivateSession } from "@/test/private-session-fixture";
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

const transport = vi.fn<typeof fetch>();
beforeEach(() => {
  transport.mockReset();
  installPrivateSession(transport);
  vi.stubGlobal("crypto", { randomUUID: () => requestId });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("loads pending reservations and sends a versioned confirmation", async () => {
  const user = userEvent.setup();
  transport
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
    screen.getByLabelText("Motivo de la decisión"),
    "Capacidad disponible",
  );
  await user.click(screen.getByRole("button", { name: "Confirmar solicitud" }));

  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Solicitud confirmada.",
    ),
  );
  expect(transport).toHaveBeenNthCalledWith(
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
  transport
    .mockResolvedValueOnce(Response.json([pendingReservation]))
    .mockResolvedValueOnce(
      Response.json({ message: "El estado cambió." }, { status: 409 }),
    )
    .mockResolvedValueOnce(Response.json([]));

  render(<OperationalReservationQueue />);

  await screen.findByText("Ana Ruiz");
  await user.click(screen.getByRole("button", { name: "Rechazar" }));
  await user.type(screen.getByLabelText("Motivo de la decisión"), "Sin cupo");
  await user.click(screen.getByRole("button", { name: "Rechazar solicitud" }));

  expect(
    await screen.findByText(/no sobrescribir otra decisión/i),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.getByText("No hay solicitudes pendientes"),
    ).toBeInTheDocument(),
  );
  expect(transport).toHaveBeenCalledTimes(3);
});

it("shows an error state and allows reloading the pending queue", async () => {
  const user = userEvent.setup();
  transport
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

async function prepareConfirmation() {
  render(<OperationalReservationQueue />);
  await screen.findByText("Ana Ruiz");
  await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
  await userEvent.type(
    screen.getByLabelText("Motivo de la decisión"),
    "Capacidad disponible",
  );
}

it.each(["network", "invalid", "server", "wrong-reservation"])(
  "reconciles %s without claiming success or resending",
  async (failure) => {
    const mocked = transport.mockResolvedValueOnce(
      Response.json([pendingReservation]),
    );
    if (failure === "network")
      mocked.mockRejectedValueOnce(new TypeError("Network"));
    else
      mocked.mockResolvedValueOnce(
        Response.json(
          failure === "wrong-reservation"
            ? {
                reservationId: requestId,
                decision: "CONFIRM",
                status: "CONFIRMED",
                rowVersion: 2,
                reason: "Capacidad disponible",
              }
            : {},
          { status: failure === "server" ? 503 : 200 },
        ),
      );
    mocked.mockResolvedValueOnce(
      Response.json([{ ...pendingReservation, rowVersion: 3 }]),
    );
    await prepareConfirmation();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar solicitud" }),
    );
    expect(
      await screen.findByText(/No pudimos confirmar el resultado/),
    ).toBeInTheDocument();
    await screen.findByText("Ana Ruiz");
    expect(screen.queryByText("Solicitud confirmada.")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Motivo de la decisión"),
    ).not.toBeInTheDocument();
    expect(transport).toHaveBeenCalledTimes(3);
  },
);

it.each([401, 403])(
  "disables decisions after HTTP %s even if the queue can still be read",
  async (status) => {
    transport
      .mockResolvedValueOnce(Response.json([pendingReservation]))
      .mockResolvedValueOnce(Response.json({}, { status }))
      .mockResolvedValueOnce(Response.json([pendingReservation]));
    await prepareConfirmation();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar solicitud" }),
    );
    await screen.findByRole("alert");
    expect(
      await screen.findByRole("button", { name: "Confirmar" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeDisabled();
  },
);

it("preserves the reason on a validation rejection and clears the stale draft on manual refresh", async () => {
  transport
    .mockResolvedValueOnce(Response.json([pendingReservation]))
    .mockResolvedValueOnce(
      Response.json({ message: "Revisa el motivo." }, { status: 400 }),
    )
    .mockResolvedValueOnce(
      Response.json([{ ...pendingReservation, rowVersion: 2 }]),
    );
  await prepareConfirmation();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar solicitud" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Revisa el motivo.",
  );
  expect(screen.getByLabelText("Motivo de la decisión")).toHaveValue(
    "Capacidad disponible",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Actualizar cola" }),
  );
  await screen.findByText("Ana Ruiz");
  expect(
    screen.queryByLabelText("Motivo de la decisión"),
  ).not.toBeInTheDocument();
});

it("rejects a reservation with the server cancellation result", async () => {
  transport
    .mockResolvedValueOnce(Response.json([pendingReservation]))
    .mockResolvedValueOnce(
      Response.json({
        reservationId,
        decision: "REJECT",
        status: "CANCELLED",
        rowVersion: 2,
        reason: "Sin cupo",
      }),
    )
    .mockResolvedValueOnce(Response.json([]));
  render(<OperationalReservationQueue />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Rechazar" }),
  );
  await userEvent.type(
    screen.getByLabelText("Motivo de la decisión"),
    "Sin cupo",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Rechazar solicitud" }),
  );
  expect(await screen.findByText("Solicitud rechazada.")).toBeInTheDocument();
  await screen.findByText("No hay solicitudes pendientes");
  expect(JSON.parse(String(transport.mock.calls[1][1]?.body))).toEqual({
    decision: "REJECT",
    reason: "Sin cupo",
    expectedVersion: 1,
  });
});

it("requires a new decision after a conflict and submits the refreshed version", async () => {
  transport
    .mockResolvedValueOnce(Response.json([pendingReservation]))
    .mockResolvedValueOnce(Response.json({}, { status: 409 }))
    .mockResolvedValueOnce(
      Response.json([{ ...pendingReservation, rowVersion: 4 }]),
    )
    .mockResolvedValueOnce(
      Response.json({
        reservationId,
        decision: "CONFIRM",
        status: "CONFIRMED",
        rowVersion: 5,
        reason: "Revisado nuevamente",
      }),
    )
    .mockResolvedValueOnce(Response.json([]));
  await prepareConfirmation();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar solicitud" }),
  );
  await screen.findByText(/no sobrescribir otra decisión/);
  await screen.findByText("Ana Ruiz");
  expect(
    screen.queryByLabelText("Motivo de la decisión"),
  ).not.toBeInTheDocument();
  expect(transport).toHaveBeenCalledTimes(3);
  await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
  await userEvent.type(
    screen.getByLabelText("Motivo de la decisión"),
    "Revisado nuevamente",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar solicitud" }),
  );
  await screen.findByText("Solicitud confirmada.");
  expect(JSON.parse(String(transport.mock.calls[3][1]?.body))).toEqual({
    decision: "CONFIRM",
    reason: "Revisado nuevamente",
    expectedVersion: 4,
  });
});

it("retries only the query when reconciliation fails after a lost decision response", async () => {
  transport
    .mockResolvedValueOnce(Response.json([pendingReservation]))
    .mockRejectedValueOnce(new TypeError("Connection lost"))
    .mockRejectedValueOnce(new TypeError("Server unreachable"))
    .mockResolvedValueOnce(Response.json([]));
  await prepareConfirmation();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar solicitud" }),
  );
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(3));
  await waitFor(() =>
    expect(
      screen.queryByText("Cargando solicitudes pendientes…"),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByRole("button", { name: "Confirmar" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Solicitud confirmada.")).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Actualizar cola" }),
  );
  await screen.findByText("No hay solicitudes pendientes");
  expect(
    transport.mock.calls.filter(([, options]) => options?.method === "PUT"),
  ).toHaveLength(1);
});

it("sends one decision when the confirmation is double clicked", async () => {
  let resolveDecision!: (response: Response) => void;
  transport
    .mockResolvedValueOnce(Response.json([pendingReservation]))
    .mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveDecision = resolve;
      }),
    )
    .mockResolvedValueOnce(Response.json([]));
  await prepareConfirmation();
  await userEvent.dblClick(
    screen.getByRole("button", { name: "Confirmar solicitud" }),
  );
  expect(transport).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
  resolveDecision(
    Response.json({
      reservationId,
      decision: "CONFIRM",
      status: "CONFIRMED",
      rowVersion: 2,
      reason: "Capacidad disponible",
    }),
  );
  await screen.findByText("Solicitud confirmada.");
  expect(
    transport.mock.calls.filter(([, options]) => options?.method === "PUT"),
  ).toHaveLength(1);
});
