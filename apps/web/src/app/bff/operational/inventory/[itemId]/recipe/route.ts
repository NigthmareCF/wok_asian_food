import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
const valid = (value: unknown) =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { parentItemId?: unknown }).parentItemId === "string" &&
  Array.isArray((value as { components?: unknown }).components);
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params;
  if (!isUuid(itemId))
    return NextResponse.json({ message: "Item inválido." }, { status: 400 });
  return endpoint(request, {
    path: `operational/inventory/items/${itemId}/recipe`,
    method: "GET",
    validate: valid,
  });
}
