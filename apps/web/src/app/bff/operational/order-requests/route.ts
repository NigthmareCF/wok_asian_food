import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  isOperationalOrderRequests,
  orderRequestStatuses,
} from "@/modules/orders/order-request-contract";

export const GET = (request: NextRequest) => {
  const status = request.nextUrl.searchParams.get("status");
  const type = request.nextUrl.searchParams.get("type");
  if (
    (status !== null &&
      !orderRequestStatuses.includes(
        status as (typeof orderRequestStatuses)[number],
      )) ||
    (type !== null && !["PICKUP", "DELIVERY"].includes(type))
  )
    return NextResponse.json(
      { message: "El filtro solicitado no es válido." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  const params = new URLSearchParams();
  if (status !== null) params.set("status", status);
  if (type !== null) params.set("type", type);
  const query = params.size ? `?${params}` : "";
  return endpoint(request, {
    path: `operational/order-requests${query}`,
    method: "GET",
    bindClientPrincipal: true,
    validate: isOperationalOrderRequests,
  });
};
