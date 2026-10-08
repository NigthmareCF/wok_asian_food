import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  isKitchenTicket,
  parseKitchenTicketStatus,
} from "@/modules/kitchen/live-contract";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ ticketId: string }> },
) {
  const { ticketId } = await context.params;
  if (!isUuid(ticketId))
    return NextResponse.json({ message: "Comanda inválida." }, { status: 400 });
  return endpoint(request, {
    path: `operational/kitchen/tickets/${ticketId}/status`,
    method: "PATCH",
    parse: parseKitchenTicketStatus,
    validate: isKitchenTicket,
    requestId: true,
  });
}
