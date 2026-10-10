import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  isAdminServiceCapability,
  parseCapabilityChange,
} from "@/modules/service-capabilities/admin-capability-contract";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  if (!code || code.length > 100) {
    return new Response(
      JSON.stringify({ message: "Revisa el código del servicio." }),
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
    path: `admin/service-capabilities/${encodeURIComponent(code)}`,
    method: "PUT",
    parse: parseCapabilityChange,
    validate: isAdminServiceCapability,
    requestId: true,
  });
}
