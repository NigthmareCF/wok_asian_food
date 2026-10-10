import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isCashSession } from "@/modules/cash/live-contract";

export const GET = (request: NextRequest) => {
  const registerCode =
    request.nextUrl.searchParams.get("registerCode") || "MAIN";
  return endpoint(request, {
    path: `operational/cash-sessions/current?registerCode=${encodeURIComponent(registerCode)}`,
    method: "GET",
    validate: isCashSession,
  });
};

export const POST = (request: NextRequest) =>
  endpoint(request, {
    path: "operational/cash-sessions",
    method: "POST",
    parse: (value) => {
      if (!value || typeof value !== "object") return null;
      const body = value as Record<string, unknown>;
      return typeof body.registerCode === "string" &&
        typeof body.openingFloat === "number" &&
        body.openingFloat >= 0
        ? {
            registerCode: body.registerCode.trim(),
            openingFloat: body.openingFloat,
          }
        : null;
    },
    validate: isCashSession,
    idempotent: true,
    requestId: true,
  });
