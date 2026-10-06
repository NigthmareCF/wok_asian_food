import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  isOrderSummary,
  parseOrderStatus,
} from "@/modules/orders/live-contract";
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;
  if (!isUuid(orderId))
    return NextResponse.json(
      { message: "Identificador inválido." },
      { status: 400 },
    );
  return endpoint(request, {
    path: `operational/orders/${orderId}/status`,
    method: "PATCH",
    validate: isOrderSummary,
    parse: parseOrderStatus,
    requestId: true,
  });
}
