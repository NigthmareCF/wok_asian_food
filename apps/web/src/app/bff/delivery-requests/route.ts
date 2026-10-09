import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  parseDeliveryRequest,
  isDeliveryReceipt,
  isDeliveryHistory,
} from "@/modules/delivery/client-contract";
export const GET = (request: NextRequest) =>
  endpoint(request, {
    path: "client/delivery-requests",
    method: "GET",
    validate: isDeliveryHistory,
    bindClientPrincipal: true,
  });
export const POST = (request: NextRequest) =>
  endpoint(request, {
    path: "client/delivery-requests",
    method: "POST",
    parse: parseDeliveryRequest,
    validate: isDeliveryReceipt,
    idempotent: true,
    bindClientPrincipal: true,
  });
