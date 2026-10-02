import { NextResponse } from "next/server";
import { currentSession } from "@/modules/auth/server/auth-session";

export async function GET() {
  const user = await currentSession();
  if (!user)
    return NextResponse.json({ message: "Sin sesión." }, { status: 401 });
  return NextResponse.json({ user });
}
