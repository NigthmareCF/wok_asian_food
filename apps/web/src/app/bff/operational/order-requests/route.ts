import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isOperationalOrderRequests } from "@/modules/orders/order-request-contract";

export const GET = (request: NextRequest) => {
  const status = request.nextUrl.searchParams.get("status");
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return endpoint(request, {
    path: `operational/order-requests${query}`,
    method: "GET",
    bindClientPrincipal: true,
    validate: isOperationalOrderRequests,
  });
};
