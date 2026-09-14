import type { OrderChannel } from "./orders";

// Existing project services; selecting one does not enable fulfillment.
export const cartServiceOptions: readonly {
  id: OrderChannel;
  label: string;
}[] = [
  { id: "table", label: "Mesa" },
  { id: "pickup", label: "Para recoger" },
  { id: "delivery", label: "Delivery" },
];
