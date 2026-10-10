export type InventoryItem = {
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  trackInventory: boolean;
  active: boolean;
  minimumStock: number;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  status: "OK" | "LOW" | "OUT" | "UNTRACKED";
};
export type InventoryMovement = {
  id: string;
  type: string;
  quantityDelta: number;
  reason: string | null;
  orderId: string | null;
  responsibleUserId: string;
  occurredAt: string;
};
export type InventoryDetails = {
  item: InventoryItem;
  movements: InventoryMovement[];
};
export type MovementReceipt = {
  movementId: string;
  itemId: string;
  type: string;
  quantityDelta: number;
  quantityOnHand: number;
  unit: string;
  idempotentReplay: boolean;
};
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
export const isInventoryItem = (value: unknown): value is InventoryItem =>
  record(value) &&
  typeof value.itemId === "string" &&
  typeof value.quantityOnHand === "number" &&
  typeof value.quantityAvailable === "number";
export const isInventoryList = (value: unknown): value is InventoryItem[] =>
  Array.isArray(value) && value.every(isInventoryItem);
export const isInventoryDetails = (value: unknown): value is InventoryDetails =>
  record(value) &&
  isInventoryItem(value.item) &&
  Array.isArray(value.movements);
export const isMovementReceipt = (value: unknown): value is MovementReceipt =>
  record(value) &&
  typeof value.movementId === "string" &&
  typeof value.quantityOnHand === "number";
