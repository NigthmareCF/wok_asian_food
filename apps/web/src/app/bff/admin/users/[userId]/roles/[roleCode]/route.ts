import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { isManagedUser, parseRoleChange } from "@/modules/users/live-contract";
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ userId: string; roleCode: string }> },
) {
  const { userId, roleCode } = await context.params;
  if (!isUuid(userId) || !["ADMIN", "OPERATIONAL"].includes(roleCode))
    return NextResponse.json(
      { message: "Rol o usuario inválido." },
      { status: 400 },
    );
  return endpoint(request, {
    path: `admin/users/${userId}/roles/${roleCode}`,
    method: "PUT",
    parse: parseRoleChange,
    validate: (value) => isManagedUser(value) && value.id === userId,
    bindClientPrincipal: true,
  });
}
