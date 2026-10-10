import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  isStationLoads,
  normalizeStationLoads,
} from "@/modules/operation/dashboard-contract";
export const GET = (request: NextRequest) =>
  endpoint(request, {
    path: "operational/kitchen/load",
    method: "GET",
    validate: isStationLoads,
    normalize: normalizeStationLoads,
  });
