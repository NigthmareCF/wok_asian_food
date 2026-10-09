import { afterEach, expect, it } from "vitest";
import { createOrderAttemptStore } from "./order-attempt-store";
const user = "11111111-1111-4111-8111-111111111111",
  account = "22222222-2222-4222-8222-222222222222",
  item = "33333333-3333-4333-8333-333333333333";
const attempt = {
  accountId: account,
  url: "/bff/operational/orders",
  key: item,
  body: JSON.stringify({
    accountId: account,
    channel: "DINE_IN",
    guestCount: 2,
    items: [{ menuItemId: item, quantity: 1, fulfillment: "DINE_IN" }],
  }),
  uncertain: false,
  confirmed: false,
};
afterEach(() => sessionStorage.clear());
it("recupera el mismo intento tras recarga y lo conserva como incierto", () => {
  createOrderAttemptStore(user, account, undefined).save(attempt);
  const recovered = createOrderAttemptStore(
    user,
    account,
    undefined,
  ).getSnapshot();
  expect(recovered).toEqual({
    ...attempt,
    ownerId: user,
    orderId: undefined,
    uncertain: true,
  });
});
it("aísla el intento por operador, cuenta y pedido", () => {
  createOrderAttemptStore(user, account, undefined).save(attempt);
  expect(
    createOrderAttemptStore(item, account, undefined).getSnapshot(),
  ).toBeNull();
  expect(
    createOrderAttemptStore(user, item, undefined).getSnapshot(),
  ).toBeNull();
  expect(createOrderAttemptStore(user, account, item).getSnapshot()).toBeNull();
});
it("bloquea datos corruptos en lugar de enviar un pedido nuevo", () => {
  sessionStorage.setItem(
    `wok.order.attempt.v1:${user}:${account}:new`,
    "invalid",
  );
  const store = createOrderAttemptStore(user, account, undefined);
  expect(store.getSnapshot()).toBeNull();
  expect(store.getNotice()).toContain("recuperar");
});
