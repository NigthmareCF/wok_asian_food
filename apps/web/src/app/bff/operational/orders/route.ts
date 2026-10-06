import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  isOrderSummaries,
  isOrderReceipt,
  parseCreateOrder,
  orderStatuses,
} from "@/modules/orders/live-contract";
export function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");
  const tableId = request.nextUrl.searchParams.get("tableId");
  if (
    (status && !orderStatuses.some((s) => s === status)) ||
    (tableId && !isUuid(tableId))
  )
    return NextResponse.json(
      { message: "Filtros inválidos." },
      { status: 400 },
    );
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (tableId) query.set("tableId", tableId);
  return endpoint(request, {
    path: "operational/orders" + (query.size ? "?" + query : ""),
    method: "GET",
    validate: isOrderSummaries,
  });
}
export const POST = (request: NextRequest) =>
  endpoint(request, {
    path: "operational/orders",
    method: "POST",
    parse: parseCreateOrder,
    validate: isOrderReceipt,
    idempotent: true,
    requestId: true,
  });
