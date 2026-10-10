import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isOrderSummaries } from "@/modules/operation/dashboard-contract";
export const GET = (request: NextRequest) =>
  endpoint(request, {
    path: "operational/orders",
    method: "GET",
    validate: isOrderSummaries,
  });
