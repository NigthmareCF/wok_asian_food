import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  isOperationalOrderDetails,
  parseAddOperationalOrderItems,
} from "@/modules/orders/live-contract";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;
  if (!isUuid(orderId))
    return NextResponse.json({ message: "Pedido inválido." }, { status: 400 });
  return endpoint(request, {
    path: `operational/orders/${orderId}/items`,
    method: "POST",
    parse: parseAddOperationalOrderItems,
    validate: isOperationalOrderDetails,
    idempotent: true,
    bindClientPrincipal: true,
    requestId: true,
  });
}
