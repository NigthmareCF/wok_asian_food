import { afterEach, describe, expect, it, vi } from "vitest";
import { formatServiceDateTime } from "./service-time";

describe("restaurant time", () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each(["America/Guatemala", "UTC", "Asia/Tokyo"])(
    "F3: same appointment on %s devices",
    (zone) => {
      vi.stubEnv("TZ", zone);
      const value = formatServiceDateTime("2026-10-10T00:15:00Z");
      const expected = new Intl.DateTimeFormat("es-GT", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Guatemala",
      }).format(new Date("2026-10-10T00:15:00Z"));
      expect(value).toBe(expected);
      expect(value).toMatch(/18:15|6:15/);
    },
  );
  it("renders Guatemala time and the previous local day across UTC midnight", () => {
    const value = formatServiceDateTime("2026-10-10T01:25:00Z");
    expect(value).toContain("9");
    expect(value).toMatch(/19:25|7:25/);
    expect(value).not.toContain("1:25");
  });
  it("does not display an invalid date", () => {
    expect(formatServiceDateTime("bad")).toBe("Horario no disponible");
  });
});
