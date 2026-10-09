import { serviceInputValue } from "@/modules/checkout/pickup-window";
// ClientDeliveryRequestController solo exige superar el tiempo de preparación.
export function firstDeliveryTime(
  preparationSeconds: number,
  now = new Date(),
) {
  return serviceInputValue(
    new Date(
      Math.ceil(
        (now.getTime() + Math.max(0, preparationSeconds) * 1000 + 60000) /
          60000,
      ) * 60000,
    ),
  );
}
