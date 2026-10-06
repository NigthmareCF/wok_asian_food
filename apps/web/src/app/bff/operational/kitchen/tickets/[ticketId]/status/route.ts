import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  isKitchenTicket,
  parseTicketStatus,
} from "@/modules/kitchen/live-contract";
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ ticketId: string }> },
) {
  const { ticketId } = await context.params;
  if (!isUuid(ticketId))
    return NextResponse.json(
      { message: "Identificador inválido." },
      { status: 400 },
    );
  return endpoint(request, {
    path: `operational/kitchen/tickets/${ticketId}/status`,
    method: "PATCH",
    validate: isKitchenTicket,
    parse: parseTicketStatus,
    requestId: true,
  });
}
