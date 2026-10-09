import { NextRequest } from "next/server";
import { attemptEndpoint } from "@/modules/payments/server/attempt-endpoint";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ accountId: string; attemptId: string }> },
) {
  return attemptEndpoint(request, "capture", await context.params);
}
