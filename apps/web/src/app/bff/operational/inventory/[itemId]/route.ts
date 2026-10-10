import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { isInventoryDetails } from "@/modules/inventory/live-contract";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params;
  if (!isUuid(itemId))
    return NextResponse.json({ message: "Item inválido." }, { status: 400 });
  return endpoint(request, {
    path: `operational/inventory/items/${itemId}`,
    method: "GET",
    validate: isInventoryDetails,
  });
}
