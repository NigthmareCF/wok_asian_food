import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  isOperationalReservationDecisionResult,
  parseOperationalReservationDecision,
} from "@/modules/reservations/live-contract";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ reservationId: string }> },
) {
  const { reservationId } = await context.params;
  if (!isUuid(reservationId))
    return NextResponse.json(
      { message: "Reserva inválida." },
      { status: 400 },
    );
  return endpoint(request, {
    path: `operational/reservations/${reservationId}/decision`,
    method: "PUT",
    parse: parseOperationalReservationDecision,
    validate: (value) =>
      isOperationalReservationDecisionResult(value) &&
      value.reservationId === reservationId,
    requestId: true,
  });
}
