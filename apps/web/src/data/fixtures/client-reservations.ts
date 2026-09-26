export type ClientReservationAvailability = {
  label: string;
  tone: "info";
};

export type ClientReservationFixture = {
  availability: ClientReservationAvailability;
  defaultPeople: number;
  defaultTime: string;
  lastNormalEntryTime: string;
};

export const clientReservationFixture: ClientReservationFixture = {
  availability: {
    label: "Disponibilidad simulada",
    tone: "info",
  },
  defaultPeople: 4,
  defaultTime: "20:00",
  lastNormalEntryTime: "21:15",
};
