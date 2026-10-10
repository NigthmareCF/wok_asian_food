import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  financialErrors,
  isAccountBalances,
} from "@/modules/payments/live-contract";
export function GET(request: NextRequest) {
  const tableId = request.nextUrl.searchParams.get("tableId");
  if (tableId && !isUuid(tableId))
    return NextResponse.json({ message: "Mesa inválida." }, { status: 400 });
  return endpoint(request, {
    path: `operational/accounts${tableId ? "?tableId=" + tableId : ""}`,
    method: "GET",
    bindClientPrincipal:
      request.headers.has("X-Wok-Expected-Principal") ||
      !request.headers.has("X-Financial-Actor"),
    bindFinancialActor: request.headers.has("X-Financial-Actor"),
    validate: isAccountBalances,
    errorMessages: financialErrors,
  });
}
