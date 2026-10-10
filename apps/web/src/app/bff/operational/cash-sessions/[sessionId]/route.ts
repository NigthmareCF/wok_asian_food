import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { financialErrors } from "@/modules/payments/live-contract";
import { isCashSession } from "@/modules/cash/live-contract";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!isUuid(sessionId))
    return NextResponse.json({ message: "Turno inválido." }, { status: 400 });
  return endpoint(request, {
    path: `operational/cash-sessions/${sessionId}`,
    method: "GET",
    validate: (v) => isCashSession(v) && v.id === sessionId,
    errorMessages: financialErrors,
  });
}
