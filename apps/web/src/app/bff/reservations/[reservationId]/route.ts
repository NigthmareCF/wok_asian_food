import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { isReservationCancellation } from "@/modules/reservations/live-contract";
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ reservationId: string }> },
) {
  const { reservationId } = await context.params;
  if (!isUuid(reservationId))
    return NextResponse.json({ message: "Reserva inválida." }, { status: 400 });
  return endpoint(request, {
    path: `client/reservations/${reservationId}`,
    method: "DELETE",
    validate: (v) =>
      isReservationCancellation(v) && v.reservationId === reservationId,
  });
}
