import { NextRequest } from "next/server";
import { attemptEndpoint } from "@/modules/payments/server/attempt-endpoint";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ accountId: string; attemptId: string }> },
) {
  return attemptEndpoint(request, "review", await context.params);
}
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ accountId: string; attemptId: string }> },
) {
  return attemptEndpoint(request, "resolve", await context.params);
}
