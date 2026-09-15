export type ServiceSnapshot = {
  state: "open" | "closed";
  preparationMinutes: readonly [number, number] | null;
  availability: string;
};

export const clientServiceFixture: ServiceSnapshot = {
  state: "open",
  preparationMinutes: [25, 35],
  availability: "Servicio disponible",
};
