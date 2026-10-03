import { NextRequest } from "next/server";
import { messagingEndpoint } from "@/modules/messaging/server/live-endpoint";
type Context = { params: Promise<{ scope: string; segments?: string[] }> };
export async function GET(request: NextRequest, context: Context) {
  const { scope, segments } = await context.params;
  return messagingEndpoint(request, scope, segments);
}
export const POST = GET;
