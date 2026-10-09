import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { isOperationalAccount } from "@/modules/payments/live-contract";

export async function GET(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  if (!isUuid(accountId)) return NextResponse.json({ message: "Cuenta inválida." }, { status: 400 });
  return endpoint(request, { path: `operational/accounts/${accountId}`, method: "GET", validate: isOperationalAccount });
}

