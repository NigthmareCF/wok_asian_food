import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  financialErrors,
  isAccountDetails,
} from "@/modules/payments/live-contract";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ accountId: string }> },
) {
  const { accountId } = await context.params;
  if (!isUuid(accountId))
    return NextResponse.json({ message: "Cuenta inválida." }, { status: 400 });
  return endpoint(request, {
    path: `operational/accounts/${accountId}`,
    method: "GET",
    bindClientPrincipal:
      request.headers.has("X-Wok-Expected-Principal") ||
      !request.headers.has("X-Financial-Actor"),
    bindFinancialActor: request.headers.has("X-Financial-Actor"),
    validate: (v) => isAccountDetails(v) && v.account.id === accountId,
    errorMessages: financialErrors,
  });
}
