import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  isConversation,
  isConversations,
  isMessages,
  isMessageReceipt,
  parseMessage,
} from "../live-contract";
export async function messagingEndpoint(
  request: NextRequest,
  scope: string,
  segments: string[] = [],
) {
  if (!["client", "operational"].includes(scope))
    return NextResponse.json(
      { message: "Ruta no encontrada." },
      { status: 404 },
    );
  const root = segments.length === 0;
  const messages =
    segments.length === 2 && isUuid(segments[0]) && segments[1] === "messages";
  if (!root && !messages)
    return NextResponse.json(
      { message: "Ruta no encontrada." },
      { status: 404 },
    );
  if (request.method === "POST" && root && scope !== "client")
    return NextResponse.json(
      { message: "Acción no permitida." },
      { status: 405 },
    );
  const path = `${scope}/conversations${messages ? `/${segments[0]}/messages` : ""}`;
  if (request.method === "GET")
    return endpoint(request, {
      path,
      method: "GET",
      validate: root ? isConversations : isMessages,
    });
  return endpoint(request, {
    path,
    method: "POST",
    validate: root ? isConversation : isMessageReceipt,
    ...(messages ? { parse: parseMessage, idempotent: true } : {}),
  });
}
