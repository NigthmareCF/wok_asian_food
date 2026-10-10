import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  isClientProfile,
  normalizeClientProfile,
  parseProfileUpdate,
} from "@/modules/clients/profile-contract";
export const GET = (request: NextRequest) =>
  endpoint(request, {
    path: "client/profile",
    method: "GET",
    validate: isClientProfile,
    normalize: normalizeClientProfile,
    bindClientPrincipal: true,
  });
export const PUT = (request: NextRequest) =>
  endpoint(request, {
    path: "client/profile",
    method: "PUT",
    parse: parseProfileUpdate,
    validate: isClientProfile,
    normalize: normalizeClientProfile,
    bindClientPrincipal: true,
  });
