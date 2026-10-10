import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isOrderChanges } from "@/modules/client-order-tracking/change-contract";
export async function GET(request: NextRequest) {
  return endpoint(request, {
    path: "operational/order-change-requests",
    method: "GET",
    validate: isOrderChanges,
  });
}
