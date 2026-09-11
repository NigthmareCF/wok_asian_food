export type ReservationAvailability = {
  label: string;
  tone: "info";
};

export type ReservationFixture = {
  availability: ReservationAvailability;
  defaultDate: string;
  defaultPeople: number;
  defaultTime: string;
  lastNormalEntryTime: string;
};

export const reservationFixture: ReservationFixture = {
  availability: {
    label: "Disponibilidad simulada",
    tone: "info",
  },
  defaultDate: "2026-09-15",
  defaultPeople: 4,
  defaultTime: "20:00",
  lastNormalEntryTime: "21:15",
};
