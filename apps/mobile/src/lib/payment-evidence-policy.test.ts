import { describe, expect, it } from "vitest";
import { canSubmitPaymentEvidence } from "./payment-evidence-policy";

describe("transfer evidence upload policy", () => {
  it("waits until the server confirms the current evidence state", () => {
    expect(canSubmitPaymentEvidence(false)).toBe(false);
    expect(canSubmitPaymentEvidence(true)).toBe(true);
  });

  it.each(["NEEDS_REVIEW", "VERIFIED"] as const)("prevents a second upload while evidence is %s", (status) => {
    expect(canSubmitPaymentEvidence(true, status)).toBe(false);
  });

  it("allows a replacement only after rejection", () => {
    expect(canSubmitPaymentEvidence(true, "REJECTED")).toBe(true);
  });
});
