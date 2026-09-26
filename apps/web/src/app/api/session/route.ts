import { NextRequest, NextResponse } from "next/server";
import {
  clearWokCookies,
  fetchWithWokSession,
  getWokApiBaseUrl,
  sameOriginMutation,
  setWokCookies,
} from "@/shared/server/wok-backend";

export async function POST(request: NextRequest) {
  const baseUrl = getWokApiBaseUrl();
  if (!baseUrl)
    return NextResponse.json(
      { message: "La conexión con el backend WOK no está configurada." },
      { status: 503 },
    );
  let credentials: { email?: string; password?: string };
  try {
    credentials = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }
  if (
    !credentials ||
    typeof credentials !== "object" ||
    typeof credentials.email !== "string" ||
    typeof credentials.password !== "string" ||
    !credentials.email.trim() ||
    !credentials.password ||
    credentials.email.length > 254 ||
    credentials.password.length > 128
  )
    return NextResponse.json(
      { message: "Correo o contraseña inválidos." },
      { status: 400 },
    );

  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
        clientType: "WEB",
      }),
    });
    if (response.status === 401)
      return NextResponse.json(
        { message: "No se pudo iniciar sesión con esos datos." },
        { status: 401 },
      );
    if (!response.ok)
      return NextResponse.json(
        { message: "El servicio de acceso está temporalmente indisponible." },
        { status: 503 },
      );
    const tokens = await response.json();
    await setWokCookies(tokens);
    let destination = "/client";
    const adminCheck = await fetch(
      `${baseUrl}/api/v1/admin/users?limit=1&offset=0`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(3_000),
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    ).catch(() => null);
    if (adminCheck?.ok) destination = "/admin";
    else {
      const operationalCheck = await fetch(
        `${baseUrl}/api/v1/operational/reservations/pending`,
        {
          cache: "no-store",
          signal: AbortSignal.timeout(3_000),
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        },
      ).catch(() => null);
      if (operationalCheck?.ok) destination = "/operation";
    }
    return NextResponse.json({ authenticated: true, destination });
  } catch {
    return NextResponse.json(
      { message: "No pudimos conectar con el servicio WOK." },
      { status: 503 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOriginMutation(request))
    return NextResponse.json(
      { message: "Solicitud no permitida." },
      { status: 403 },
    );
  try {
    await fetchWithWokSession("/api/v1/auth/logout", { method: "POST" });
  } catch {
    /* Local cookie removal still closes the browser session when the backend is offline. */
  }
  await clearWokCookies();
  return new NextResponse(null, { status: 204 });
}
