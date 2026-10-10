import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isClientSessionList } from "@/modules/profile/session-contract";

export const GET = (request: NextRequest) =>
  endpoint(request, {
    path: "client/sessions",
    method: "GET",
    validate: isClientSessionList,
  });
