import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isOperationalOrderDetails } from "@/modules/orders/live-contract";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;
  if (!isUuid(orderId))
    return NextResponse.json({ message: "Pedido inválido." }, { status: 400 });
  return endpoint(request, {
    path: `operational/orders/${orderId}`,
    method: "GET",
    bindClientPrincipal: true,
    validate: isOperationalOrderDetails,
  });
}
