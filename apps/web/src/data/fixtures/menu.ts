export type MenuFixture = {
  id: string;
  name: string;
  description: string;
  availability: "Disponible" | "Pocas unidades";
};

export const menuFixtures: MenuFixture[] = [
  {
    id: "menu-01",
    name: "Maki atun",
    description: "Referencia visual para el catalogo.",
    availability: "Disponible",
  },
  {
    id: "menu-02",
    name: "Crunchy",
    description: "Referencia visual para el catalogo.",
    availability: "Pocas unidades",
  },
  {
    id: "menu-03",
    name: "Uramaki salmon",
    description: "Referencia visual para el catalogo.",
    availability: "Disponible",
  },
  {
    id: "menu-04",
    name: "Bebida fria",
    description: "Referencia visual para el catalogo.",
    availability: "Disponible",
  },
];
