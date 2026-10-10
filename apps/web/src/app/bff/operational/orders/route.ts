import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  isOperationalOrderReceipt,
  isOperationalOrderSummaries,
  parseCreateOperationalOrder,
} from "@/modules/orders/live-contract";

function listPath(request: NextRequest) {
  const params = new URLSearchParams();
  for (const key of ["status", "tableId"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return `operational/orders${query ? `?${query}` : ""}`;
}

export const GET = (request: NextRequest) =>
  endpoint(request, {
    path: listPath(request),
    method: "GET",
    validate: isOperationalOrderSummaries,
    bindClientPrincipal: true,
  });

export const POST = (request: NextRequest) =>
  endpoint(request, {
    path: "operational/orders",
    method: "POST",
    parse: parseCreateOperationalOrder,
    validate: isOperationalOrderReceipt,
    idempotent: true,
    bindClientPrincipal: true,
    requestId: true,
  });
