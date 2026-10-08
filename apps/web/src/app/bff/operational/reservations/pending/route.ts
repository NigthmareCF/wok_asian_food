import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isOperationalPendingReservations } from "@/modules/reservations/live-contract";

export const GET = (request: NextRequest) =>
  endpoint(request, {
    path: "operational/reservations/pending",
    method: "GET",
    bindClientPrincipal: true,
    validate: isOperationalPendingReservations,
  });
