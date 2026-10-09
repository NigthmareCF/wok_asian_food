import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { isCashSession } from "@/modules/cash/live-contract";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!isUuid(sessionId))
    return NextResponse.json({ message: "Sesión inválida." }, { status: 400 });
  return endpoint(request, {
    path: `operational/cash-sessions/${sessionId}/close`,
    method: "POST",
    parse: (value) => {
      if (!value || typeof value !== "object") return null;
      const body = value as Record<string, unknown>;
      return typeof body.countedCash === "number" &&
        body.countedCash >= 0 &&
        Number.isInteger(body.expectedVersion) &&
        Number(body.expectedVersion) > 0
        ? {
            countedCash: body.countedCash,
            expectedVersion: body.expectedVersion,
          }
        : null;
    },
    validate: isCashSession,
    requestId: true,
  });
}
