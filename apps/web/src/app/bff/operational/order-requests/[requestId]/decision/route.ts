import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  isOrderRequestDecisionResult,
  parseOrderRequestDecision,
} from "@/modules/orders/order-request-contract";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await context.params;
  if (!isUuid(requestId))
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  return endpoint(request, {
    path: `operational/order-requests/${requestId}/decision`,
    method: "POST",
    parse: parseOrderRequestDecision,
    validate: isOrderRequestDecisionResult,
    requestId: true,
  });
}
