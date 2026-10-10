import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  isAdminUser,
  isSupportedAdminRoleCode,
  parseAdminRoleChange,
} from "@/modules/users/admin-user-contract";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ userId: string; roleCode: string }> },
) {
  const { userId, roleCode } = await context.params;
  if (!isUuid(userId) || !isSupportedAdminRoleCode(roleCode)) {
    return new Response(
      JSON.stringify({ message: "Revisa el usuario o rol enviado." }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }
  return endpoint(request, {
    path: `admin/users/${userId}/roles/${roleCode}`,
    method: "PUT",
    parse: parseAdminRoleChange,
    validate: isAdminUser,
  });
}
