import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { isMovementReceipt } from "@/modules/inventory/live-contract";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params;
  if (!isUuid(itemId))
    return NextResponse.json({ message: "Item inválido." }, { status: 400 });
  return endpoint(request, {
    path: `operational/inventory/items/${itemId}/movements`,
    method: "POST",
    validate: isMovementReceipt,
    idempotent: true,
    requestId: true,
    parse: (value) => {
      if (!value || typeof value !== "object") return null;
      const body = value as Record<string, unknown>;
      return ["ENTRY", "ADJUSTMENT", "WASTE"].includes(String(body.type)) &&
        typeof body.quantity === "number" &&
        body.quantity >= 0 &&
        (body.reason === undefined || typeof body.reason === "string")
        ? {
            type: body.type,
            quantity: body.quantity,
            ...(body.reason === undefined ? {} : { reason: body.reason }),
          }
        : null;
    },
  });
}
