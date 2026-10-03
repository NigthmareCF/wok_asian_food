import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isOperationalTable } from "@/modules/tables/live-contract";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tableId: string }> },
) {
  const { tableId } = await context.params;
  if (!isUuid(tableId))
    return NextResponse.json({ message: "Mesa inválida." }, { status: 400 });
  return endpoint(request, {
    path: `operational/tables/${tableId}/close`,
    method: "POST",
    validate: isOperationalTable,
    requestId: true,
  });
}
