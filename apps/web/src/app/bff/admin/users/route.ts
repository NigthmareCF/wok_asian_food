import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isAdminUserList } from "@/modules/users/admin-user-contract";

function listPath(request: NextRequest): string | null {
  const search = request.nextUrl.searchParams.get("search") ?? "";
  const limitText = request.nextUrl.searchParams.get("limit") ?? "50";
  const offsetText = request.nextUrl.searchParams.get("offset") ?? "0";
  const limit = Number(limitText);
  const offset = Number(offsetText);
  if (
    search.length > 100 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  )
    return null;
  const params = new URLSearchParams({
    search: search.trim(),
    limit: String(limit),
    offset: String(offset),
  });
  return `admin/users?${params.toString()}`;
}

export const GET = (request: NextRequest) => {
  const path = listPath(request);
  if (!path) {
    return new Response(
      JSON.stringify({ message: "Revisa los filtros enviados." }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }
  return endpoint(request, { path, method: "GET", validate: isAdminUserList });
};
