import { describe, expect, it } from "vitest";
import { parseOrderChangeAttempts, removeOrderChangeAttempt, resolveOrderChangeAttempt } from "./order-change-attempts";

const owner = "edgar@example.com";
const orderRequestId = "11111111-1111-4111-8111-111111111111";
const firstKey = "22222222-2222-4222-8222-222222222222";
const secondKey = "33333333-3333-4333-8333-333333333333";

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

  it("discards malformed and expired attempts and removes only the matching account order", () => {
    const valid = resolveOrderChangeAttempt([], owner, orderRequestId, "No puedo llegar", () => firstKey, 1000);
    const expired = { ...valid[0], key: secondKey, savedAt: 0 };
    expect(parseOrderChangeAttempts(JSON.stringify([...valid, expired, { ...valid[0], key: "bad" }]), 31 * 24 * 60 * 60 * 1000))
      .toEqual([]);
    const other = resolveOrderChangeAttempt(valid, "other@example.com", orderRequestId, "No puedo llegar", () => secondKey, 2000);
    expect(removeOrderChangeAttempt(other, owner, orderRequestId)).toEqual([other[1]]);
  });
});
