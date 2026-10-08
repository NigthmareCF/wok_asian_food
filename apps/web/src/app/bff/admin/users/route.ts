import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isManagedUsers } from "@/modules/users/live-contract";
export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const search = query.get("search") ?? "";
  const offset = query.get("offset") ?? "0";
  if (
    search.length > 100 ||
    !/^\d{1,8}$/.test(offset) ||
    [...query.keys()].some((key) => !["search", "offset"].includes(key))
  )
    return NextResponse.json(
      { message: "Filtros inválidos." },
      { status: 400 },
    );
  return endpoint(request, {
    path: `admin/users?${new URLSearchParams({ search, limit: "50", offset })}`,
    method: "GET",
    validate: isManagedUsers,
    bindClientPrincipal: true,
  });
}
