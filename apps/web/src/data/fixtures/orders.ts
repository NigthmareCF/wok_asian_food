export type OrderChannel = "table" | "delivery" | "pickup";

export type OrderStatus =
  "new" | "sent" | "preparing" | "ready" | "delayed" | "cancelled";

export type ProductAvailability = "available" | "low" | "unavailable";

export type ProductModifierGroup = {
  id: string;
  label: string;
  required: boolean;
  options: { id: string; label: string; price: number }[];
};

export type OrderProduct = {
  id: string;
  name: string;
  description: string;
  category: "Entradas" | "Woks" | "Sushi" | "Bebidas";
  price: number;
  eta: number;
  availability: ProductAvailability;
  remaining?: number;
  modifierGroups?: ProductModifierGroup[];
};

export type OrderItem = {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers: string[];
  notes?: string;
};

export type OrderRecord = {
  id: string;
  channel: OrderChannel;
  source: string;
  status: OrderStatus;
  createdAt: string;
  elapsed: string;
  eta: string;
  responsible: string;
  items: OrderItem[];
  kitchenUpdates: number;
};

export const orderProducts: OrderProduct[] = [
  {
    id: "gyoza",
    name: "Gyozas de cerdo",
    description: "Seis piezas doradas con salsa ponzu.",
    category: "Entradas",
    price: 68,
    eta: 8,
    availability: "available",
  },
  {
    id: "edamame",
    name: "Edamame picante",
    description: "Frijol de soya, chile y sal de ajo.",
    category: "Entradas",
    price: 48,
    eta: 5,
    availability: "available",
  },
  {
    id: "wok-teriyaki",
    name: "Wok teriyaki",
    description: "Vegetales, arroz jazmín y salsa teriyaki.",
    category: "Woks",
    price: 112,
    eta: 14,
    availability: "available",
    modifierGroups: [
      {
        id: "protein",
        label: "Proteína",
        required: true,
        options: [
          { id: "chicken", label: "Pollo", price: 0 },
          { id: "beef", label: "Res", price: 18 },
          { id: "tofu", label: "Tofu", price: 0 },
        ],
      },
      {
        id: "spice",
        label: "Nivel de picante",
        required: true,
        options: [
          { id: "mild", label: "Sin picante", price: 0 },
          { id: "medium", label: "Medio", price: 0 },
          { id: "hot", label: "Alto", price: 0 },
        ],
      },
    ],
  },
  {
    id: "pad-thai",
    name: "Pad thai",
    description: "Fideos de arroz, tamarindo, maní y vegetales.",
    category: "Woks",
    price: 126,
    eta: 16,
    availability: "low",
    remaining: 5,
    modifierGroups: [
      {
        id: "protein",
        label: "Proteína",
        required: true,
        options: [
          { id: "shrimp", label: "Camarón", price: 22 },
          { id: "chicken", label: "Pollo", price: 0 },
          { id: "tofu", label: "Tofu", price: 0 },
        ],
      },
    ],
  },
  {
    id: "ramen-shoyu",
    name: "Ramen shoyu",
    description: "Caldo de soya, cerdo, huevo y cebollín.",
    category: "Woks",
    price: 122,
    eta: 18,
    availability: "available",
  },
  {
    id: "salmon-bowl",
    name: "Bowl de salmón",
    description: "Salmón, arroz, aguacate y pepino.",
    category: "Woks",
    price: 148,
    eta: 12,
    availability: "low",
    remaining: 3,
  },
  {
    id: "tempura-roll",
    name: "Roll tempura",
    description: "Camarón tempura, aguacate y salsa dulce.",
    category: "Sushi",
    price: 96,
    eta: 13,
    availability: "available",
  },
  {
    id: "salmon-roll",
    name: "Roll de salmón",
    description: "Salmón fresco, queso crema y aguacate.",
    category: "Sushi",
    price: 104,
    eta: 12,
    availability: "unavailable",
  },
  {
    id: "lemonade",
    name: "Limonada de jengibre",
    description: "Limón, jengibre fresco y hierbabuena.",
    category: "Bebidas",
    price: 42,
    eta: 4,
    availability: "available",
  },
  {
    id: "green-tea",
    name: "Té verde frío",
    description: "Té verde, limón y un toque de miel.",
    category: "Bebidas",
    price: 38,
    eta: 3,
    availability: "available",
  },
];

export const initialOrders: OrderRecord[] = [
  {
    id: "A-104",
    channel: "table",
    source: "Mesa 7",
    status: "preparing",
    createdAt: "13:08",
    elapsed: "Hace 12 min",
    eta: "9 min",
    responsible: "Sofía M.",
    kitchenUpdates: 1,
    items: [
      {
        id: "A-104-1",
        productId: "ramen-shoyu",
        name: "Ramen shoyu",
        quantity: 2,
        unitPrice: 122,
        modifiers: [],
      },
      {
        id: "A-104-2",
        productId: "gyoza",
        name: "Gyozas de cerdo",
        quantity: 1,
        unitPrice: 68,
        modifiers: [],
      },
      {
        id: "A-104-3",
        productId: "green-tea",
        name: "Té verde frío",
        quantity: 2,
        unitPrice: 38,
        modifiers: [],
      },
    ],
  },
  {
    id: "D-088",
    channel: "delivery",
    source: "Delivery · Andrea López",
    status: "delayed",
    createdAt: "13:02",
    elapsed: "Hace 18 min",
    eta: "7 min tarde",
    responsible: "Carlos R.",
    kitchenUpdates: 0,
    items: [
      {
        id: "D-088-1",
        productId: "pad-thai",
        name: "Pad thai",
        quantity: 1,
        unitPrice: 148,
        modifiers: ["Camarón"],
      },
      {
        id: "D-088-2",
        productId: "tempura-roll",
        name: "Roll tempura",
        quantity: 1,
        unitPrice: 96,
        modifiers: [],
      },
    ],
  },
  {
    id: "A-106",
    channel: "table",
    source: "Mesa 3",
    status: "ready",
    createdAt: "13:14",
    elapsed: "Hace 6 min",
    eta: "Listo",
    responsible: "Luis A.",
    kitchenUpdates: 0,
    items: [
      {
        id: "A-106-1",
        productId: "wok-teriyaki",
        name: "Wok teriyaki",
        quantity: 1,
        unitPrice: 112,
        modifiers: ["Pollo", "Medio"],
      },
      {
        id: "A-106-2",
        productId: "green-tea",
        name: "Té verde frío",
        quantity: 1,
        unitPrice: 38,
        modifiers: [],
      },
    ],
  },
  {
    id: "R-041",
    channel: "pickup",
    source: "Recoger · Mateo Díaz",
    status: "new",
    createdAt: "13:17",
    elapsed: "Hace 3 min",
    eta: "16 min",
    responsible: "Sin asignar",
    kitchenUpdates: 0,
    items: [
      {
        id: "R-041-1",
        productId: "salmon-bowl",
        name: "Bowl de salmón",
        quantity: 2,
        unitPrice: 148,
        modifiers: [],
      },
      {
        id: "R-041-2",
        productId: "lemonade",
        name: "Limonada de jengibre",
        quantity: 1,
        unitPrice: 42,
        modifiers: [],
      },
    ],
  },
  {
    id: "A-107",
    channel: "table",
    source: "Mesa 5",
    status: "sent",
    createdAt: "13:16",
    elapsed: "Hace 4 min",
    eta: "14 min",
    responsible: "Sofía M.",
    kitchenUpdates: 0,
    items: [
      {
        id: "A-107-1",
        productId: "wok-teriyaki",
        name: "Wok teriyaki",
        quantity: 2,
        unitPrice: 112,
        modifiers: ["Res", "Sin picante"],
      },
    ],
  },
];

export const getOrderTotal = (items: OrderItem[]) =>
  items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
