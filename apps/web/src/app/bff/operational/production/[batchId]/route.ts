import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { isProductionDetails } from "@/modules/production/live-contract";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await context.params;
  if (!isUuid(batchId))
    return NextResponse.json({ message: "Lote inválido." }, { status: 400 });
  return endpoint(request, {
    path: `operational/production/batches/${batchId}`,
    method: "GET",
    validate: isProductionDetails,
  });
}
