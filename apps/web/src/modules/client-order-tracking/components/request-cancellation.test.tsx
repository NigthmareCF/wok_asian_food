import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  installPrivateSession,
  staffFixtureId,
} from "@/test/private-session-fixture";
import { clientIdentityStore } from "@/modules/clients/client-identity-store";
import { RequestCancellation } from "./request-cancellation";
import { OrderChangeReview } from "@/modules/orders/components/order-change-review";
const requestId = "30000000-0000-4000-8000-000000000001";
const receipt = {
  id: "30000000-0000-4000-8000-000000000002",
  orderRequestId: requestId,
  orderCode: "WOK-TEST",
  requestType: "CANCEL_ORDER",
  status: "PENDING_REVIEW",
  reason: "Cambio de horario",
  expectedOrderVersion: 1,
  version: 1,
  requestedAt: "2026-10-09T20:00:00Z",
};
beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  clientIdentityStore.invalidate();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function openForm() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Solicitar cancelación" }),
  );
  expect(document.activeElement).toContainElement(
    screen.getByLabelText("Motivo de cancelación"),
  );
  fireEvent.change(screen.getByLabelText("Motivo de cancelación"), {
    target: { value: "Cambio de horario" },
  });
}

it("F4 accepts and sends 500 supplementary characters without truncating the reason", async () => {
  const reason = "😀".repeat(500);
  const fetcher = vi.fn((_input, init?: RequestInit) =>
    Promise.resolve(
      Response.json(init?.method === "POST" ? { ...receipt, reason } : null),
    ),
  );
  installPrivateSession(fetcher);
  render(
    <RequestCancellation
      requestId={requestId}
      userId={staffFixtureId}
      reviewed
      onChanged={vi.fn()}
    />,
  );
  await openForm();
  const field = screen.getByLabelText(
    "Motivo de cancelación",
  ) as HTMLTextAreaElement;
  expect(field.maxLength).toBeGreaterThanOrEqual(reason.length);
  fireEvent.change(field, { target: { value: reason } });
  fireEvent.click(
    screen.getByRole("button", { name: "Enviar solicitud de cancelación" }),
  );
  await waitFor(() =>
    expect(fetcher.mock.calls.some((call) => call[1]?.method === "POST")).toBe(
      true,
    ),
  );
  const submitted = fetcher.mock.calls.find(
    (call) => call[1]?.method === "POST",
  )![1]!;
  expect(JSON.parse(String(submitted.body))).toEqual({ reason });
});

it("F4 operational review rejects two code points before saving an attempt or sending PATCH", async () => {
  const fetcher = vi.fn(() => Promise.resolve(Response.json([receipt])));
  installPrivateSession(fetcher);
  render(<OrderChangeReview />);
  const field = await screen.findByLabelText("Motivo de decisión");
  const save = vi.spyOn(Storage.prototype, "setItem");
  fireEvent.change(field, { target: { value: "😀a" } });
  for (const label of ["Aprobar cancelación", "Rechazar cancelación"]) {
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(
      screen.getByText(
        "Indica un motivo de 3 a 500 caracteres; es opcional al aprobar.",
      ),
    ).toBeInTheDocument();
  }
  expect(save).not.toHaveBeenCalled();
  expect(
    fetcher.mock.calls.every(
      (call) =>
        (call as unknown as [unknown, RequestInit])[1]?.method !== "PATCH",
    ),
  ).toBe(true);
});

it("F4 operational review sends a valid 500 supplementary character decision", async () => {
  const reason = "😀".repeat(500);
  const fetcher = vi.fn((_input, init?: RequestInit) =>
    Promise.resolve(
      Response.json(
        init?.method === "PATCH"
          ? {
              ...receipt,
              status: "REJECTED",
              version: 2,
              decisionReason: reason,
            }
          : [receipt],
      ),
    ),
  );
  installPrivateSession(fetcher);
  render(<OrderChangeReview />);
  const field = (await screen.findByLabelText(
    "Motivo de decisión",
  )) as HTMLTextAreaElement;
  expect(field.maxLength).toBeGreaterThanOrEqual(reason.length);
  fireEvent.change(field, { target: { value: reason } });
  fireEvent.click(screen.getByRole("button", { name: "Rechazar cancelación" }));
  await waitFor(() =>
    expect(fetcher.mock.calls.some((call) => call[1]?.method === "PATCH")).toBe(
      true,
    ),
  );
  const sent = fetcher.mock.calls.find(
    (call) => call[1]?.method === "PATCH",
  )![1]!;
  expect(JSON.parse(String(sent.body))).toEqual({
    decision: "REJECT",
    expectedVersion: 1,
    reason,
    override:false,
  });
});

it("F2 discards a late current cancellation after the account changes", async () => {
  let owner = staffFixtureId;
  let finish!: (response: Response) => void;
  installPrivateSession(
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
    () => owner,
  );
  render(
    <RequestCancellation
      requestId={requestId}
      userId={staffFixtureId}
      reviewed
      onChanged={vi.fn()}
    />,
  );
  await waitFor(() => expect(finish).toBeDefined());
  await act(async () => {
    owner = "40000000-0000-4000-8000-000000000002";
    await clientIdentityStore.refresh();
    finish(Response.json({ ...receipt, reason: "Historial privado anterior" }));
  });
  expect(
    screen.queryByText(/Historial privado anterior/),
  ).not.toBeInTheDocument();
});

it("keeps the decision visible after cancellation while preventing another request", async () => {
  installPrivateSession(
    vi.fn(() =>
      Promise.resolve(
        Response.json({
          ...receipt,
          status: "APPROVED",
          version: 2,
          decisionReason: "Aprobación registrada",
          decidedAt: "2026-10-09T20:05:00Z",
        }),
      ),
    ),
  );
  render(
    <RequestCancellation
      requestId={requestId}
      userId={staffFixtureId}
      reviewed
      allowRequest={false}
      onChanged={vi.fn()}
    />,
  );
  expect(await screen.findByText(/Aprobación registrada/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Solicitar cancelación" }),
  ).not.toBeInTheDocument();
});
it("retains the same key and body after a lost response and prevents concurrent sends", async () => {
  const submissions: RequestInit[] = [];
  let lose!: (error: Error) => void;
  installPrivateSession(
    vi.fn((_url, init) => {
      if (init?.method !== "POST") return Promise.resolve(Response.json(null));
      submissions.push(init);
      return submissions.length === 1
        ? new Promise<Response>((_resolve, reject) => {
            lose = reject;
          })
        : Promise.resolve(Response.json(receipt, { status: 201 }));
    }),
  );
  const changed = vi.fn();
  render(
    <RequestCancellation
      requestId={requestId}
      userId={staffFixtureId}
      reviewed
      onChanged={changed}
    />,
  );
  await openForm();
  const button = screen.getByRole("button", {
    name: "Enviar solicitud de cancelación",
  });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(submissions).toHaveLength(1));
  await act(async () => lose(new Error("Respuesta perdida")));
  fireEvent.click(
    await screen.findByRole("button", { name: "Reintentar misma solicitud" }),
  );
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(submissions).toHaveLength(2);
  expect(submissions[0].body).toBe(submissions[1].body);
  expect(submissions[0].headers).toEqual(submissions[1].headers);
  expect(submissions[0].headers).toHaveProperty(
    "X-Wok-Expected-Principal",
    staffFixtureId,
  );
});
it("does not publish a late success after the session changes", async () => {
  let owner = staffFixtureId;
  let finish!: (response: Response) => void;
  installPrivateSession(
    vi.fn((_url, init) =>
      init?.method === "POST"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(Response.json(null)),
    ),
    () => owner,
  );
  const changed = vi.fn();
  render(
    <RequestCancellation
      requestId={requestId}
      userId={staffFixtureId}
      reviewed
      onChanged={changed}
    />,
  );
  await openForm();
  fireEvent.click(
    screen.getByRole("button", { name: "Enviar solicitud de cancelación" }),
  );
  await waitFor(() => expect(finish).toBeDefined());
  await act(async () => {
    owner = "40000000-0000-4000-8000-000000000002";
    await clientIdentityStore.refresh();
    finish(Response.json(receipt, { status: 201 }));
  });
  expect(changed).not.toHaveBeenCalled();
  expect(
    screen.queryByText(/Solicitud registrada para revisión/),
  ).not.toBeInTheDocument();
});
it("does not send a reviewed cancellation if durable storage fails", async () => {
  const fetcher = vi.fn(() => Promise.resolve(Response.json(null)));
  installPrivateSession(fetcher);
  render(
    <RequestCancellation
      requestId={requestId}
      userId={staffFixtureId}
      reviewed
      onChanged={vi.fn()}
    />,
  );
  await openForm();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Almacenamiento no disponible");
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Enviar solicitud de cancelación" }),
  );
  await screen.findByText("Almacenamiento no disponible");
  expect(
    fetcher.mock.calls.every(
      (call) =>
        (call as unknown as [unknown, RequestInit])[1]?.method !== "POST",
    ),
  ).toBe(true);
});
