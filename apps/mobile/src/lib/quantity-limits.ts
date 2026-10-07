/** Integer bounds supported by the Spring/PostgreSQL request DTOs. */
export const MAX_API_INTEGER = 2_147_483_647;

export function isValidPositiveApiInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_API_INTEGER;
}
