import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { isDeliveryDetails } from "@/modules/delivery/client-contract";
import { isPickupCancellation } from "@/modules/client-order-tracking/pickup-details";
export async function DELETE(
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
    path: `client/delivery-requests/${requestId}`,
    method: "DELETE",
    bindClientPrincipal: true,
    validate: (value) =>
      isPickupCancellation(value) && value.requestId === requestId,
  });
}
export async function GET(
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
    path: `client/delivery-requests/${requestId}`,
    method: "GET",
    bindClientPrincipal: true,
    validate: (v) => isDeliveryDetails(v) && v.requestId === requestId,
  });
}
