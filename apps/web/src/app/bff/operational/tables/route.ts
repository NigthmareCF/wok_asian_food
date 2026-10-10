import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  isOperationalTable,
  isOperationalTables,
  parseCreateOperationalTable,
} from "@/modules/tables/live-contract";

function listPath(request: NextRequest) {
  const params = new URLSearchParams();
  for (const key of ["status", "zone", "active"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return `operational/tables${query ? `?${query}` : ""}`;
}

export const GET = (request: NextRequest) =>
  endpoint(request, {
    path: listPath(request),
    method: "GET",
    bindClientPrincipal: true,
    validate: isOperationalTables,
  });

export const POST = (request: NextRequest) =>
  endpoint(request, {
    path: "operational/tables",
    method: "POST",
    parse: parseCreateOperationalTable,
    validate: isOperationalTable,
    requestId: true,
  });
