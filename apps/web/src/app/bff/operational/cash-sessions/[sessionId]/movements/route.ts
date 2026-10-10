import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { isCashMovement } from "@/modules/cash/live-contract";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!isUuid(sessionId))
    return NextResponse.json({ message: "Sesión inválida." }, { status: 400 });
  return endpoint(request, {
    path: `operational/cash-sessions/${sessionId}/movements`,
    method: "POST",
    parse: (value) => {
      if (!value || typeof value !== "object") return null;
      const body = value as Record<string, unknown>;
      return ["INCOME", "EXPENSE", "WITHDRAWAL"].includes(String(body.type)) &&
        typeof body.amount === "number" &&
        body.amount > 0 &&
        typeof body.reason === "string" &&
        body.reason.trim().length >= 3
        ? { type: body.type, amount: body.amount, reason: body.reason.trim() }
        : null;
    },
    validate: isCashMovement,
    idempotent: true,
    requestId: true,
  });
}
