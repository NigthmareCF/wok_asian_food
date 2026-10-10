import { NextRequest } from "next/server";
import { attemptEndpoint } from "@/modules/payments/server/attempt-endpoint";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ accountId: string }> },
) {
  return attemptEndpoint(request, "history", await context.params);
}
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ accountId: string }> },
) {
  return attemptEndpoint(request, "prepare", await context.params);
}
