// Datos exclusivos de pruebas; no se importan desde las vistas.
import type {
  CreateOrder,
  OrderDetails,
  OrderReceipt,
  OrderSummary,
} from "@/modules/orders/live-contract";
import type {
  KitchenTicket,
  StationLoad,
} from "@/modules/kitchen/live-contract";
export const testId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const testOrder: OrderSummary = {
  id: testId(1),
  code: "ORD-TEST-001",
  status: "SENT",
  channel: "DINE_IN",
  subtotal: 90,
  discount: 5,
  total: 85,
  currency: "GTQ",
  currencyId: testId(2),
  guestCount: 2,
  openedAt: "2026-10-03T12:00:00Z",
  rowVersion: 2,
  diningTableId: testId(3),
  diningTableName: "Mesa prueba",
  accountId: testId(4),
  accountName: "Cuenta prueba",
  itemCount: 1,
};
export const testTicket: KitchenTicket = {
  id: testId(5),
  orderId: testOrder.id,
  orderCode: testOrder.code,
  sequence: 1,
  status: "QUEUED",
  rowVersion: 1,
  stationId: testId(6),
  stationCode: "WOK",
  channel: "DINE_IN",
  diningTableName: testOrder.diningTableName,
  accountName: testOrder.accountName,
  itemCount: 1,
  totalQuantity: 2,
};
export const testLoad: StationLoad = {
  stationId: testId(6),
  stationCode: "WOK",
  queued: 1,
  preparing: 0,
  ready: 0,
};
export const testDetails: OrderDetails = {
  order: testOrder,
  items: [
    {
      id: testId(7),
      name: "Arroz de prueba",
      quantity: 2,
      unitPrice: 45,
      lineTotal: 90,
      fulfillment: "DINE_IN",
      preparationAreaId: testId(6),
      stationCode: "WOK",
    },
  ],
  tickets: [testTicket],
};
export const testReceipt: OrderReceipt = {
  orderId: testOrder.id,
  code: testOrder.code,
  status: "SENT",
  channel: "DINE_IN",
  subtotal: 90,
  discount: 5,
  total: 85,
  currency: "GTQ",
  rowVersion: 2,
  itemCount: 1,
  idempotentReplay: false,
};
export const testCreate: CreateOrder = {
  accountId: testId(4),
  channel: "DINE_IN",
  guestCount: 2,
  notes: "Sin prisa",
  items: [
    {
      menuItemId: testId(8),
      quantity: 2,
      fulfillment: "DINE_IN",
      notes: "Sin sal",
    },
  ],
};
export const testTable = {
  id: testId(3),
  name: "Mesa prueba",
  capacity: 4,
  zone: "PRINCIPAL",
  active: true,
  status: "OCCUPIED",
  rowVersion: 2,
  updatedAt: "2026-10-03T12:00:00Z",
  accountId: testId(4),
  accountName: "Cuenta prueba",
  accountStatus: "OPEN",
};
export const testMenu = {
  categories: [
    {
      id: testId(9),
      name: "Woks",
      items: [
        {
          id: testId(8),
          name: "Arroz de prueba",
          price: 45,
          currency: "GTQ",
          estimatedPreparationSeconds: 600,
        },
      ],
    },
  ],
  asOf: "2026-10-03T12:00:00Z",
};
