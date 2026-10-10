import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  isClientAddress,
  isClientAddressList,
  parseCreateClientAddress,
} from "@/modules/profile/address-contract";

export const GET = (request: NextRequest) =>
  endpoint(request, {
    path: "client/addresses",
    method: "GET",
    validate: isClientAddressList,
  });

export const POST = (request: NextRequest) =>
  endpoint(request, {
    path: "client/addresses",
    method: "POST",
    parse: parseCreateClientAddress,
    validate: isClientAddress,
  });
