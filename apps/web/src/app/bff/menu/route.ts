import { NextResponse } from "next/server";
import { loadPublicMenu } from "@/modules/menu/server/public-menu";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    return NextResponse.json(await loadPublicMenu(), { headers });
  } catch {
    return NextResponse.json(
      { message: "No fue posible cargar el menú. Intenta nuevamente." },
      { status: 503, headers },
    );
  }
}
