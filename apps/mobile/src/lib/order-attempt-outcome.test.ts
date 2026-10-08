import { describe, expect, it } from "vitest";
import { isDefinitiveOrderAttemptRejection } from "./order-attempt-outcome";

describe("order attempt response certainty", () => {
  it.each([400, 401, 403, 404, 409, 422])("treats definite client rejection %i as safe to discard", (status) => {
    expect(isDefinitiveOrderAttemptRejection(status)).toBe(true);
  });

  it.each([undefined, 408, 425, 429, 500, 502, 503, 504])("retains the same attempt for uncertain response %s", (status) => {
    expect(isDefinitiveOrderAttemptRejection(status)).toBe(false);
  });
});
