import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";

import { financialErrors } from "@/modules/payments/live-contract";
import { isCashSession } from "@/modules/cash/live-contract";
export function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get("registerCode") ?? "MAIN")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9_-]{1,32}$/.test(code))
    return NextResponse.json({ message: "Caja inválida." }, { status: 400 });
  return endpoint(request, {
    path: `operational/cash-sessions/current?registerCode=${encodeURIComponent(code)}`,
    method: "GET",
    validate: isCashSession,
    errorMessages: {
      ...financialErrors,
      404: "No hay un turno abierto para esta caja.",
    },
  });
}
