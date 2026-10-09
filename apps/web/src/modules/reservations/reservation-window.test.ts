import { describe, expect, it } from "vitest";
import {
  nextReservationWindow,
  reservationInputToInstant,
} from "./reservation-window";
describe("horario de reservas según OperationalCapacityService", () => {
  it("propone hoy desde apertura en Guatemala aunque el dispositivo use otra zona", () => {
    expect(
      nextReservationWindow(new Date("2026-10-07T15:00:00Z")).defaultValue,
    ).toBe("2026-10-07T14:00");
    expect(
      reservationInputToInstant(
        "2026-10-07T14:00",
        new Date("2026-10-07T15:00:00Z"),
      )?.toISOString(),
    ).toBe("2026-10-07T20:00:00.000Z");
  });
  it("respeta el aviso de tres horas y propone el siguiente día si hoy no hay horario", () => {
    expect(
      nextReservationWindow(new Date("2026-10-07T23:00:00Z")).defaultValue,
    ).toBe("2026-10-07T20:01");
    expect(
      nextReservationWindow(new Date("2026-10-08T01:00:00Z")).defaultValue,
    ).toBe("2026-10-08T14:00");
  });
  it("rechaza horarios fuera de ventana, fechas imposibles y aviso insuficiente", () => {
    const now = new Date("2026-10-07T15:00:00Z");
    for (const value of [
      "2026-10-07T13:59",
      "2026-10-07T21:16",
      "2026-02-30T14:00",
      "2026-10-07T11:00",
    ])
      expect(reservationInputToInstant(value, now)).toBeNull();
    expect(reservationInputToInstant("2026-10-07T21:15", now)).not.toBeNull();
  });
});
