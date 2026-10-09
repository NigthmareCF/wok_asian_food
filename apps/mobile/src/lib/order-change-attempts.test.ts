import { describe, expect, it } from "vitest";
import { orderChangeAttemptsForOwner, parseOrderChangeAttempts, removeOrderChangeAttempt, resolveOrderChangeAttempt } from "./order-change-attempts";

const owner = "edgar@example.com";
const orderRequestId = "11111111-1111-4111-8111-111111111111";
const firstKey = "22222222-2222-4222-8222-222222222222";
const secondKey = "33333333-3333-4333-8333-333333333333";
const firstItemId = "44444444-4444-4444-8444-444444444444";
const secondItemId = "55555555-5555-4555-8555-555555555555";

describe("order change idempotency attempts", () => {
  it("keeps the same key for a retry after relaunch when the reason is unchanged", () => {
    const initial = resolveOrderChangeAttempt([], owner, orderRequestId, "No puedo llegar", () => firstKey, 1000);
    const restored = parseOrderChangeAttempts(JSON.stringify(initial), 2000);
    const retried = resolveOrderChangeAttempt(restored, owner.toUpperCase(), orderRequestId, "No puedo llegar", () => secondKey, 3000);

    expect(retried).toEqual(initial);
  });

  it("creates a new key when the request meaning changes and keeps other accounts isolated", () => {
    const otherAccount = resolveOrderChangeAttempt([], "other@example.com", orderRequestId, "No puedo llegar", () => firstKey, 1000);
    const changed = resolveOrderChangeAttempt(otherAccount, owner, orderRequestId, "Cambió mi horario", () => secondKey, 2000);

    expect(changed).toHaveLength(2);
    expect(changed.find((attempt) => attempt.ownerEmail === owner)?.key).toBe(secondKey);
    expect(changed.find((attempt) => attempt.ownerEmail === "other@example.com")?.key).toBe(firstKey);
  });

  it("migrates only the signed-in account's legacy attempts to its scoped store", () => {
    const own = resolveOrderChangeAttempt([], owner, orderRequestId, "No puedo llegar", () => firstKey, 1000);
    const other = resolveOrderChangeAttempt([], "another@example.com", orderRequestId, "Estoy fuera", () => secondKey, 1000);
    const legacy = parseOrderChangeAttempts(JSON.stringify([...own, ...other]), 2000);

    expect(orderChangeAttemptsForOwner(legacy, owner.toUpperCase())).toEqual(own);
    expect(orderChangeAttemptsForOwner(legacy, " ")).toEqual([]);
  });

  it("discards malformed and expired attempts and removes only the matching account order", () => {
    const valid = resolveOrderChangeAttempt([], owner, orderRequestId, "No puedo llegar", () => firstKey, 1000);
    const expired = { ...valid[0], key: secondKey, savedAt: 0 };
    expect(parseOrderChangeAttempts(JSON.stringify([...valid, expired, { ...valid[0], key: "bad" }]), 31 * 24 * 60 * 60 * 1000))
      .toEqual([]);
    const other = resolveOrderChangeAttempt(valid, "other@example.com", orderRequestId, "No puedo llegar", () => secondKey, 2000);
    expect(removeOrderChangeAttempt(other, owner, orderRequestId)).toEqual([other[1]]);
  });

  it("keeps idempotency attempts independent for each item in one order", () => {
    const firstItem = resolveOrderChangeAttempt([], owner, orderRequestId, "No deseo este platillo", () => firstKey,
      1000, firstItemId);
    const secondItem = resolveOrderChangeAttempt(firstItem, owner, orderRequestId, "Otro producto", () => secondKey,
      2000, secondItemId);

    expect(secondItem).toHaveLength(2);
    expect(resolveOrderChangeAttempt(secondItem, owner, orderRequestId, "No deseo este platillo", () => secondKey,
      3000, firstItemId)).toEqual(secondItem);
    expect(removeOrderChangeAttempt(secondItem, owner, orderRequestId, firstItemId)).toEqual([secondItem[1]]);
    expect(parseOrderChangeAttempts(JSON.stringify([{ ...secondItem[0], orderItemId: "invalid" }]), 3000)).toEqual([]);
  });

  it("reads legacy whole-order attempts without an item id", () => {
    const attempt = resolveOrderChangeAttempt([], owner, orderRequestId, "No puedo llegar", () => firstKey, 1000)[0];
    const legacy = { ...attempt };
    delete legacy.orderItemId;

    expect(parseOrderChangeAttempts(JSON.stringify([legacy]), 2000)).toEqual([legacy]);
    expect(resolveOrderChangeAttempt([legacy], owner, orderRequestId, "No puedo llegar", () => secondKey, 3000))
      .toEqual([legacy]);
  });

  it("keeps cancellation and quantity-change keys separate and rotates when the requested quantity changes", () => {
    const cancelled = resolveOrderChangeAttempt([], owner, orderRequestId, "No deseo este platillo", () => firstKey,
      1000, firstItemId);
    const changed = resolveOrderChangeAttempt(cancelled, owner, orderRequestId, "Quiero otra cantidad", () => secondKey,
      2000, firstItemId, "MODIFY_QUANTITY", 2);
    const anotherQuantity = resolveOrderChangeAttempt(changed, owner, orderRequestId, "Quiero otra cantidad", () => firstKey,
      3000, firstItemId, "MODIFY_QUANTITY", 3);

    expect(anotherQuantity).toHaveLength(3);
    expect(anotherQuantity.map((attempt) => attempt.key)).toEqual([firstKey, secondKey, firstKey]);
    expect(removeOrderChangeAttempt(anotherQuantity, owner, orderRequestId, firstItemId,
      "MODIFY_QUANTITY", 2)).toHaveLength(2);
  });

  it("keeps modifier-change retries idempotent per selected option set", () => {
    const firstOption = "66666666-6666-4666-8666-666666666666";
    const secondOption = "77777777-7777-4777-8777-777777777777";
    const first = resolveOrderChangeAttempt([], owner, orderRequestId, "Sin picante", () => firstKey,
      1000, firstItemId, "MODIFY_MODIFIERS", undefined, [firstOption]);
    const retry = resolveOrderChangeAttempt(first, owner, orderRequestId, "Sin picante", () => secondKey,
      2000, firstItemId, "MODIFY_MODIFIERS", undefined, [firstOption]);
    const changed = resolveOrderChangeAttempt(retry, owner, orderRequestId, "Sin picante", () => secondKey,
      3000, firstItemId, "MODIFY_MODIFIERS", undefined, [secondOption]);

    expect(retry).toEqual(first);
    expect(changed).toHaveLength(2);
    expect(parseOrderChangeAttempts(JSON.stringify(changed), 4000)).toEqual(changed);
    expect(removeOrderChangeAttempt(changed, owner, orderRequestId, firstItemId,
      "MODIFY_MODIFIERS", undefined, [firstOption])).toEqual([changed[1]]);
  });
});
