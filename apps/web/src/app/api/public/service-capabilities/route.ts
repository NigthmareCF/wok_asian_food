import { NextResponse } from "next/server";

const capabilityCodes = new Set([
  "LOCAL",
  "RESERVATIONS",
  "DINE_IN_ONLINE",
  "PICKUP",
  "DELIVERY",
  "ONLINE_ORDERS",
  "MESSAGING",
  "ONLINE_PAYMENTS",
  "PRODUCTION",
]);
const statuses = new Set([
  "ENABLED",
  "MANUAL_APPROVAL",
  "PAUSED",
  "DISABLED",
]);

function apiBaseUrl() {
  const value = process.env.WOK_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      (process.env.NODE_ENV === "production" && parsed.protocol !== "https:")
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

export async function GET() {
  const baseUrl = apiBaseUrl();
  if (!baseUrl)
    return NextResponse.json(
      { message: "El estado de los servicios no está disponible." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const response = await fetch(
      `${baseUrl}/api/v1/public/service-capabilities`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok)
      return NextResponse.json(
        { message: "El estado de los servicios no está disponible." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error("Respuesta inválida.");
    const capabilities = payload.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const code = "code" in item ? item.code : null;
      const status = "status" in item ? item.status : null;
      if (
        typeof code !== "string" ||
        typeof status !== "string" ||
        !capabilityCodes.has(code) ||
        !statuses.has(status)
      )
        return [];
      return [{ code, status }];
    });
    return NextResponse.json(capabilities, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { message: "El estado de los servicios no está disponible." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
