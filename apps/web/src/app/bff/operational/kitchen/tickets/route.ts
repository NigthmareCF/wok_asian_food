import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isKitchenTickets } from "@/modules/kitchen/live-contract";

function listPath(request: NextRequest) {
  const params = new URLSearchParams();
  for (const key of ["status", "stationId"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return `operational/kitchen/tickets${query ? `?${query}` : ""}`;
}

export const GET = (request: NextRequest) =>
  endpoint(request, {
    path: listPath(request),
    method: "GET",
    bindClientPrincipal: true,
    validate: isKitchenTickets,
  });
