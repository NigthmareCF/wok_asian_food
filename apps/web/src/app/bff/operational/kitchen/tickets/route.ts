import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { ticketStatuses } from "@/modules/orders/live-contract";
import { isKitchenTickets } from "@/modules/kitchen/live-contract";
export function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");
  const stationId = request.nextUrl.searchParams.get("stationId");
  if (
    (status &&
      status !== "OPEN" &&
      !ticketStatuses.some((s) => s === status)) ||
    (stationId && !isUuid(stationId))
  )
    return NextResponse.json(
      { message: "Filtros inválidos." },
      { status: 400 },
    );
  const query = new URLSearchParams();
  if (stationId) query.set("stationId", stationId);
  if (status) query.set("status", status);
  return endpoint(request, {
    path: "operational/kitchen/tickets" + (query.size ? "?" + query : ""),
    method: "GET",
    validate: isKitchenTickets,
  });
}
