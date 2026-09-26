import { NextRequest, NextResponse } from "next/server";
import { fetchWithWokSession } from "@/shared/server/wok-backend";

export async function GET(request: NextRequest) {
  const search =
    new URL(request.url).searchParams.get("search")?.slice(0, 100) ?? "";
  const response = await fetchWithWokSession(
    `/api/v1/admin/users?search=${encodeURIComponent(search)}&limit=100&offset=0`,
  );
  if (!response.ok)
    return NextResponse.json(
      {
        message:
          response.status === 401
            ? "Inicia sesión con una cuenta administrativa."
            : "No se pudo consultar usuarios.",
      },
      { status: response.status },
    );
  return NextResponse.json(await response.json(), {
    headers: { "Cache-Control": "no-store" },
  });
}
