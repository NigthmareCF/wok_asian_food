import { NextResponse } from "next/server";
import { isCapabilities } from "@/modules/clients/service-contract";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const base = (
      process.env.WOK_API_BASE_URL ?? "http://localhost:8080"
    ).replace(/\/$/, "");
    const response = await fetch(`${base}/api/v1/public/service-capabilities`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Unavailable");
    const body: unknown = await response.json();
    if (!isCapabilities(body)) throw new Error("Invalid response");
    return NextResponse.json(body, { headers });
  } catch {
    return NextResponse.json(
      { message: "No pudimos consultar los servicios. Intenta nuevamente." },
      { status: 503, headers },
    );
  }
}
