import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  isClientProfile,
  parseUpdateProfile,
} from "@/modules/profile/client-contract";

export const GET = (request: NextRequest) =>
  endpoint(request, {
    path: "client/profile",
    method: "GET",
    validate: isClientProfile,
  });

export const PUT = (request: NextRequest) =>
  endpoint(request, {
    path: "client/profile",
    method: "PUT",
    parse: parseUpdateProfile,
    validate: isClientProfile,
  });
