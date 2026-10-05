import { describe, expect, it } from "vitest";
import { isPollingAllowed } from "./polling-policy";

describe("isPollingAllowed", () => {
  it("allows periodic refresh only while the app is active and the screen opts in", () => {
    expect(isPollingAllowed("active", true)).toBe(true);
    expect(isPollingAllowed("background", true)).toBe(false);
    expect(isPollingAllowed("inactive", true)).toBe(false);
    expect(isPollingAllowed("active", false)).toBe(false);
  });
});
