import { NextResponse } from "next/server";
import { fetchWithWokSession } from "@/shared/server/wok-backend";

export async function GET() {
  const response = await fetchWithWokSession(
    "/api/v1/admin/service-capabilities",
  );
  if (!response.ok)
    return NextResponse.json(
      {
        message:
          response.status === 401
            ? "Inicia sesión con una cuenta administrativa."
            : response.status === 403
              ? "Tu cuenta no tiene permiso para administrar los servicios."
              : "No se pudo consultar la configuración de servicios.",
      },
      { status: response.status, headers: { "Cache-Control": "no-store" } },
    );
  return NextResponse.json(await response.json(), {
    headers: { "Cache-Control": "no-store" },
  });
}
