import { NextRequest } from "next/server";
import { attemptEndpoint } from "@/modules/payments/server/attempt-endpoint";
export async function GET(request: NextRequest) {
  return attemptEndpoint(request, "queue");
}
