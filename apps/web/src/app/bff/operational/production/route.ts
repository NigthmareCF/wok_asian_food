import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  isProductionList,
  isProductionReceipt,
} from "@/modules/production/live-contract";
export const GET = (request: NextRequest) =>
  endpoint(request, {
    path: "operational/production/batches",
    method: "GET",
    validate: isProductionList,
  });
export const POST = (request: NextRequest) =>
  endpoint(request, {
    path: "operational/production/batches",
    method: "POST",
    idempotent: true,
    requestId: true,
    validate: isProductionReceipt,
    parse: (value) => {
      if (!value || typeof value !== "object") return null;
      const body = value as Record<string, unknown>;
      return typeof body.producedItemId === "string" &&
        typeof body.quantity === "number" &&
        body.quantity > 0 &&
        (body.actualQuantity === undefined ||
          typeof body.actualQuantity === "number") &&
        (body.areaId === undefined || typeof body.areaId === "string") &&
        (body.notes === undefined || typeof body.notes === "string")
        ? body
        : null;
    },
  });
