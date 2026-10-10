import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  isOrderChange,
  parseChangeDecision,
} from "@/modules/client-order-tracking/change-contract";
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ changeId: string }> },
) {
  const { changeId } = await context.params;
  if (!isUuid(changeId))
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  return endpoint(request, {
    path: `operational/order-change-requests/${changeId}`,
    method: "PATCH",
    idempotent: true,
    bindFinancialActor: true,
    parse: parseChangeDecision,
    validate: (value) => isOrderChange(value) && value.id === changeId,
    errorMessages: {
      409: "La solicitud o el pedido cambió, o tiene pagos registrados. Actualiza y coordina con el equipo antes de continuar.",
    },
  });
}
