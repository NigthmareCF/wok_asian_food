export type ProductionBatch = {
  batchId: string;
  producedItemId: string;
  producedItem: string;
  quantity: number;
  yieldQuantity: number;
  status: string;
  producedAt: string;
  areaId: string | null;
  areaCode: string | null;
};
export type ProductionDetails = {
  batch: ProductionBatch;
  items: Array<{
    itemId: string;
    sku: string;
    name: string;
    unit: string;
    quantity: number;
  }>;
};
export type ProductionReceipt = {
  batchId: string;
  producedItemId: string;
  quantity: number;
  yieldQuantity: number;
  producedOnHand: number;
  items: ProductionDetails["items"];
  idempotentReplay: boolean;
};
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
export const isProductionBatch = (value: unknown): value is ProductionBatch =>
  record(value) &&
  typeof value.batchId === "string" &&
  typeof value.producedItemId === "string" &&
  typeof value.quantity === "number";
export const isProductionList = (value: unknown): value is ProductionBatch[] =>
  Array.isArray(value) && value.every(isProductionBatch);
export const isProductionDetails = (
  value: unknown,
): value is ProductionDetails =>
  record(value) && isProductionBatch(value.batch) && Array.isArray(value.items);
export const isProductionReceipt = (
  value: unknown,
): value is ProductionReceipt =>
  record(value) &&
  typeof value.batchId === "string" &&
  typeof value.producedOnHand === "number";
