import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { isCashSession } from "@/modules/cash/live-contract";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!isUuid(sessionId))
    return NextResponse.json({ message: "Sesión inválida." }, { status: 400 });
  return endpoint(request, {
    path: `operational/cash-sessions/${sessionId}`,
    method: "GET",
    validate: isCashSession,
  });
}
