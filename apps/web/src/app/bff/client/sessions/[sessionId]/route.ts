import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";

type Context = { params: Promise<{ sessionId: string }> };

export const DELETE = (request: NextRequest, context: Context) =>
  context.params.then(({ sessionId }) => {
    if (!isUuid(sessionId))
      return NextResponse.json({ message: "Sesión inválida." }, { status: 400 });
    return endpoint(request, {
      path: `client/sessions/${encodeURIComponent(sessionId)}`,
      method: "DELETE",
      validate: () => true,
      emptyResponse: true,
      bindClientPrincipal: true,
    });
  });
