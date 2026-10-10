import { describe, expect, it } from "vitest";
import { parseCancellation, parseChangeDecision } from "./change-contract";

describe("normalized reason characters match PostgreSQL UTF-8", () => {
  it.each([
    "",
    "   ",
    "\t\r\n",
    "ab",
    "😀a",
    " 😀a ",
    "x".repeat(501),
    "😀".repeat(501),
  ])("rejects invalid request and rejection reason #%#", (reason) => {
    expect(parseCancellation({ reason })).toBeNull();
    expect(
      parseChangeDecision({ decision: "REJECT", expectedVersion: 1, reason }),
    ).toBeNull();
    if (reason.trim())
      expect(
        parseChangeDecision({
          decision: "APPROVE",
          expectedVersion: 1,
          reason,
        }),
      ).toBeNull();
  });
  it.each([
    "abc",
    "x".repeat(500),
    "😀aa",
    "😀".repeat(3),
    "😀".repeat(500),
    "e\u0301a",
  ])(
    "preserves valid ASCII/supplementary boundaries without Unicode normalization #%#",
    (reason) => {
      expect(parseCancellation({ reason: ` ${reason} ` })).toEqual({ reason });
      for (const decision of ["APPROVE", "REJECT"]) {
        expect(
          parseChangeDecision({
            decision,
            expectedVersion: 1,
            reason: ` ${reason} `,
          }),
        ).toEqual({ decision, expectedVersion: 1, reason });
      }
    },
  );
  it.each([null, undefined, "", "   ", "\t\r\n"])(
    "retains the optional approval reason #%#",
    (reason) => {
      expect(parseCancellation({ reason })).toBeNull();
      expect(
        parseChangeDecision({ decision: "REJECT", expectedVersion: 1, reason }),
      ).toBeNull();
      expect(
        parseChangeDecision({
          decision: "APPROVE",
          expectedVersion: 1,
          reason,
        }),
      ).toEqual({ decision: "APPROVE", expectedVersion: 1, reason: null });
    },
  );
});
