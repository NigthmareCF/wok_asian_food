import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  isClientAddress,
  isClientAddressList,
  parseCreateClientAddress,
  normalizeClientAddress,
  normalizeClientAddresses,
} from "@/modules/profile/address-contract";

export const GET = (request: NextRequest) =>
  endpoint(request, {
    path: "client/addresses",
    method: "GET",
    bindClientPrincipal: true,
    validate: isClientAddressList,
    normalize: normalizeClientAddresses,
  });

export const POST = (request: NextRequest) =>
  endpoint(request, {
    path: "client/addresses",
    method: "POST",
    parse: parseCreateClientAddress,
    bindClientPrincipal: true,
    validate: isClientAddress,
    normalize: normalizeClientAddress,
  });
