export type MenuCategoryId =
  | "sushi"
  | "specialties"
  | "drinks"
  | "extras"
  | "alcohol";
export type MenuAvailability = "available" | "limited" | "unavailable";
export type MenuOption = {
  // Each group allows one choice; optional groups also allow no modifier.
  id: string;
  name: string;
  required: boolean;
  choices: readonly { id: string; name: string; priceAdjustment: number }[];
};
export type MenuProduct = {
  id: string;
  categoryId: MenuCategoryId;
  name: string;
  price: number;
  description?: string;
  availability: MenuAvailability;
  image?: { src: `/${string}`; alt: string };
  options?: readonly MenuOption[];
  homePreview?: boolean;
};
export type MenuCategory = {
  id: MenuCategoryId;
  name: string;
  description: string;
};
export const menuCategories: readonly MenuCategory[] = [
  {
    id: "sushi",
    name: "Sushi",
    description: "Makis, uramakis, rolls y oniguiris.",
  },
  {
    id: "specialties",
    name: "Especialidades",
    description:
      "Pollo, cerdo y miso ramen. Incluyen base: arroz frito, chao mein o vegetales salteados.",
  },
  {
    id: "drinks",
    name: "Bebidas",
    description: "Matcha, té, café, sodas y más para acompañar.",
  },
  {
    id: "extras",
    name: "Extras",
    description: "Aguacate, mayonesas y salsa anguila.",
  },
  {
    id: "alcohol",
    name: "Bebidas +18",
    description:
      "Cervezas y soju. Bebidas alcohólicas para mayores de 18 años.",
  },
];

// Availability is illustrative, not live inventory.
const specialtyBaseOptions: readonly MenuOption[] = [
  {
    id: "base",
    name: "Base incluida",
    required: true,
    choices: [
      {
        id: "fried-rice",
        name: "Arroz frito",
        priceAdjustment: 0,
      },
      {
        id: "chao-mein",
        name: "Chao mein",
        priceAdjustment: 0,
      },
      {
        id: "vegetables",
        name: "Vegetales salteados",
        priceAdjustment: 0,
      },
    ],
  },
];
export const menuFixtures: readonly MenuProduct[] = [
  {
    id: "maki-tuna",
    categoryId: "sushi",
    name: "Maki Atún",
    price: 70,
    homePreview: true,
    availability: "available",
  },
  {
    id: "maki-shrimp",
    categoryId: "sushi",
    name: "Maki Camarón",
    price: 65,
    availability: "available",
  },
  {
    id: "uramaki-avocado",
    categoryId: "sushi",
    name: "Uramaki Aguacate",
    price: 65,
    availability: "available",
  },
  {
    id: "uramaki-tuna",
    categoryId: "sushi",
    name: "Uramaki Atún",
    price: 70,
    availability: "available",
  },
  {
    id: "uramaki-salmon",
    categoryId: "sushi",
    name: "Uramaki Salmón",
    price: 85,
    availability: "available",
  },
  {
    id: "gamba-roll",
    categoryId: "sushi",
    name: "Gamba Roll",
    price: 75,
    availability: "available",
  },
  {
    id: "crunchy-shrimp",
    categoryId: "sushi",
    name: "Camarón Crunchy",
    price: 75,
    availability: "limited",
  },
  {
    id: "panko",
    categoryId: "sushi",
    name: "Panko",
    price: 70,
    availability: "available",
    description: "Solo atún +Q5.",
    options: [
      {
        id: "tuna-only",
        name: "Preparación",
        required: false,
        choices: [
          {
            id: "tuna-only",
            name: "Solo atún",
            priceAdjustment: 5,
          },
        ],
      },
    ],
  },
  {
    id: "oniguiris-surimi",
    categoryId: "sushi",
    name: "Oniguiris Surimi",
    price: 40,
    availability: "available",
    description: "Fritos en panko +Q5.",
    options: [
      {
        id: "panko-fried",
        name: "Preparación",
        required: false,
        choices: [
          {
            id: "panko-fried",
            name: "Fritos en panko",
            priceAdjustment: 5,
          },
        ],
      },
    ],
  },
  {
    id: "oniguiris-tuna",
    categoryId: "sushi",
    name: "Oniguiris Atún Chipotle",
    price: 45,
    availability: "available",
    description: "Fritos en panko +Q5.",
    options: [
      {
        id: "panko-fried",
        name: "Preparación",
        required: false,
        choices: [
          {
            id: "panko-fried",
            name: "Fritos en panko",
            priceAdjustment: 5,
          },
        ],
      },
    ],
  },
  {
    id: "avocado",
    categoryId: "extras",
    name: "Aguacate",
    price: 5,
    availability: "available",
  },
  {
    id: "chipotle-mayo",
    categoryId: "extras",
    name: "Mayo Chipotle",
    price: 5,
    availability: "available",
  },
  {
    id: "jalapeno-mayo",
    categoryId: "extras",
    name: "Mayo Jalapeño",
    price: 5,
    availability: "available",
  },
  {
    id: "eel-sauce",
    categoryId: "extras",
    name: "Salsa Anguila",
    price: 5,
    availability: "available",
  },
  {
    id: "orange-chicken",
    categoryId: "specialties",
    name: "Pollo a la Naranja",
    price: 65,
    homePreview: true,
    availability: "available",
    description: "Incluye base: arroz frito, chao mein o vegetales salteados.",
    options: specialtyBaseOptions,
  },
  {
    id: "teriyaki-chicken",
    categoryId: "specialties",
    name: "Pollo Teriyaki",
    price: 65,
    availability: "available",
    description: "Incluye base: arroz frito, chao mein o vegetales salteados.",
    options: specialtyBaseOptions,
  },
  {
    id: "sweet-sour-chicken",
    categoryId: "specialties",
    name: "Pollo Agridulce",
    price: 65,
    availability: "available",
    description: "Incluye base: arroz frito, chao mein o vegetales salteados.",
    options: specialtyBaseOptions,
  },
  {
    id: "sweet-sour-pork",
    categoryId: "specialties",
    name: "Cerdo Agridulce / Agridulce Picante",
    price: 70,
    availability: "available",
    description: "Incluye base: arroz frito, chao mein o vegetales salteados.",
    options: specialtyBaseOptions,
  },
  {
    id: "miso-ramen",
    categoryId: "specialties",
    name: "Miso Ramen",
    price: 70,
    availability: "available",
    description: "Incluye base: arroz frito, chao mein o vegetales salteados.",
    options: specialtyBaseOptions,
  },
  {
    id: "carbonated",
    categoryId: "drinks",
    name: "Carbonatadas",
    price: 20,
    availability: "available",
  },
  {
    id: "soft-drinks",
    categoryId: "drinks",
    name: "Gaseosas",
    price: 15,
    availability: "available",
  },
  {
    id: "korean-sodas",
    categoryId: "drinks",
    name: "Sodas Koreanas",
    price: 20,
    availability: "available",
  },
  {
    id: "japanese-ice-tea",
    categoryId: "drinks",
    name: "Ice Tea Japonés",
    price: 25,
    availability: "available",
  },
  {
    id: "water",
    categoryId: "drinks",
    name: "Agua Pura",
    price: 10,
    availability: "available",
  },
  {
    id: "coffee",
    categoryId: "drinks",
    name: "Café",
    price: 15,
    availability: "available",
  },
  {
    id: "tea",
    categoryId: "drinks",
    name: "Té",
    price: 10,
    availability: "available",
  },
  {
    id: "matcha-latte",
    categoryId: "drinks",
    name: "Matcha Latte",
    price: 30,
    homePreview: true,
    availability: "available",
  },
  {
    id: "passion-fruit-matcha",
    categoryId: "drinks",
    name: "Matcha Maracuyá",
    price: 35,
    availability: "available",
  },
  {
    id: "kiwi-matcha",
    categoryId: "drinks",
    name: "Matcha Kiwi",
    price: 35,
    availability: "available",
  },
  {
    id: "blue-matcha",
    categoryId: "drinks",
    name: "Blue Matcha",
    price: 35,
    availability: "unavailable",
  },
  {
    id: "national-beer",
    categoryId: "alcohol",
    name: "Cerveza Nacional",
    price: 20,
    availability: "available",
  },
  {
    id: "imported-beers",
    categoryId: "alcohol",
    name: "Cervezas Importadas",
    price: 35,
    availability: "available",
  },
  {
    id: "soju",
    categoryId: "alcohol",
    name: "Soju",
    price: 45,
    availability: "available",
  },
];

// Keep C-02's presentation contract backed by the same product collection.
export const homeMenuCategories = menuCategories;
export const homeMenuProducts = menuFixtures.map((product) => ({
  ...product,
  note: product.description,
}));
