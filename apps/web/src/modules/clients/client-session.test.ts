import { describe, expect, it } from "vitest";
import {
  createClientSessionStore,
  findDeliveryOrder,
  localDate,
} from "./client-session";

describe("Client session", () => {
  it("starts empty and creates independent pending orders without an ETA", () => {
    const store = createClientSessionStore();
    const options = { base: "rice" };
    const input = {
      fulfillment: "delivery" as const,
      subtotalCents: 15000,
      lines: [
        {
          id: "line",
          productId: "panko",
          title: "Panko",
          quantity: 2,
          selectedOptions: options,
          unitPriceCents: 7500,
        },
      ],
    };
    const first = store.createOrder(input)!;
    options.base = "noodles";
    const second = store.createOrder(input)!;
    expect(first.id).not.toBe(second.id);
    expect(first.lines[0].selectedOptions.base).toBe("rice");
    expect(first.status).toBe("pending");
    expect(first.estimatedTime).toBeUndefined();
    expect(first.createdAt).toMatch(/^\d{4}-/);
    expect(store.getSnapshot().orders).toHaveLength(2);
    expect(findDeliveryOrder(store.getSnapshot().orders)?.fulfillment).toBe(
      "delivery",
    );
    expect(createClientSessionStore().getSnapshot().orders).toHaveLength(0);
  });
  it("rejects an empty order and saves messages locally only once", () => {
    const store = createClientSessionStore();
    expect(
      store.createOrder({ fulfillment: "table", lines: [], subtotalCents: 0 }),
    ).toBeNull();
    store.setMessageDraft("delivery", " Estoy en la entrada. ");
    store.saveMessage("delivery", "local-order-1");
    store.saveMessage("delivery", "local-order-1");
    expect(store.getSnapshot().messages.delivery).toHaveLength(1);
    expect(store.getSnapshot().messages.delivery[0]).toMatchObject({
      status: "local",
      text: "Estoy en la entrada.",
      orderId: "local-order-1",
    });
  });
  it("deduplicates reservation confirmation and preserves its draft", () => {
    const store = createClientSessionStore();
    const draft = {
      date: "2026-10-01",
      time: "20:00",
      people: 4,
      includesPreorder: false,
      note: "Ventana",
      serviceTime: "",
    };
    store.updateReservation(draft);
    expect(store.saveReservation(draft).id).toBe(
      store.saveReservation(draft).id,
    );
    expect(store.getSnapshot().reservationDraft).toEqual(draft);
    expect(localDate(new Date(2026, 8, 17, 23, 59))).toBe("2026-09-17");
  });
});
