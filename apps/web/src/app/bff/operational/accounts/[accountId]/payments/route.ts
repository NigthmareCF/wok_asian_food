import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { isPaymentReceipt } from "@/modules/payments/live-contract";

export async function POST(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  if (!isUuid(accountId)) return NextResponse.json({ message: "Cuenta inválida." }, { status: 400 });
  return endpoint(request, {
    path: `operational/accounts/${accountId}/payments`, method: "POST", validate: isPaymentReceipt,
    idempotent: true, requestId: true,
    parse: (value) => {
      if (!value || typeof value !== "object") return null;
      const body = value as Record<string, unknown>;
      const methods = ["CASH", "CARD_EXTERNAL", "TRANSFER"];
      return methods.includes(String(body.method)) &&
        (body.amount === undefined || (typeof body.amount === "number" && body.amount > 0)) &&
        (body.tipAmount === undefined || (typeof body.tipAmount === "number" && body.tipAmount >= 0)) &&
        (body.reference === undefined || typeof body.reference === "string") &&
        (body.registerCode === undefined || typeof body.registerCode === "string")
        ? { method: body.method, ...(body.amount === undefined ? {} : { amount: body.amount }), ...(body.tipAmount === undefined ? {} : { tipAmount: body.tipAmount }), ...(body.reference === undefined ? {} : { reference: body.reference }), ...(body.registerCode === undefined ? {} : { registerCode: body.registerCode }) }
        : null;
    },
  });
}

