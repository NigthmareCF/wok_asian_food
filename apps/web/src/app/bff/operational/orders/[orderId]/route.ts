import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { isOrderDetails } from "@/modules/orders/live-contract";
export async function GET(
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
    path: `operational/orders/${orderId}`,
    method: "GET",
    validate: isOrderDetails,
  });
}
