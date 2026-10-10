import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  financialErrors,
  isPaymentReceipt,
  parsePayment,
} from "@/modules/payments/live-contract";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ accountId: string }> },
) {
  const { accountId } = await context.params;
  if (!isUuid(accountId))
    return NextResponse.json({ message: "Cuenta inválida." }, { status: 400 });
  return endpoint(request, {
    path: `operational/accounts/${accountId}/payments`,
    method: "POST",
    parse: parsePayment,
    validate: (v) => isPaymentReceipt(v) && v.accountId === accountId,
    idempotent: true,
    requestId: true,
    bindFinancialActor: true,
    errorMessages: financialErrors,
  });
}
