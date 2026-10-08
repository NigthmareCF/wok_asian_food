import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  financialErrors,
  isPaymentReceipt,
} from "@/modules/payments/live-contract";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ accountId: string; key: string }> },
) {
  const { accountId, key } = await context.params;
  if (!isUuid(accountId) || !isUuid(key))
    return NextResponse.json({ message: "Intento inválido." }, { status: 400 });
  return endpoint(request, {
    path: `operational/accounts/${accountId}/payments/by-idempotency-key/${key}`,
    method: "GET",
    validate: (v) => isPaymentReceipt(v) && v.accountId === accountId,
    bindFinancialActor: true,
    errorMessages: financialErrors,
  });
}
