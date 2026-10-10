import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  isAdminServiceCapabilityList,
  normalizeAdminCapabilities,
} from "@/modules/service-capabilities/admin-capability-contract";

export const GET = (request: NextRequest) =>
  endpoint(request, {
    path: "admin/service-capabilities",
    method: "GET",
    validate: isAdminServiceCapabilityList,
    normalize: normalizeAdminCapabilities,
  });
