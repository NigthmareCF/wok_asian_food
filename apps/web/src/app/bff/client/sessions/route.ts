import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  isClientSessionList,
  normalizeClientSessions,
} from "@/modules/profile/session-contract";

export const GET = (request: NextRequest) =>
  endpoint(request, {
    path: "client/sessions",
    method: "GET",
    bindClientPrincipal: true,
    validate: isClientSessionList,
    normalize: normalizeClientSessions,
  });
