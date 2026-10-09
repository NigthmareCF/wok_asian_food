import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import {
  parseReservation,
  isReservationResult,
  isReservationHistory,
} from "@/modules/reservations/live-contract";
export const GET = (request: NextRequest) =>
  endpoint(request, {
    path: "client/reservations",
    method: "GET",
    validate: isReservationHistory,
    bindClientPrincipal: true,
  });
export const POST = (request: NextRequest) =>
  endpoint(request, {
    path: "client/reservations",
    method: "POST",
    parse: parseReservation,
    validate: isReservationResult,
    idempotent: true,
    bindClientPrincipal: true,
  });
