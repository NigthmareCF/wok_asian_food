import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";

import { financialErrors } from "@/modules/payments/live-contract";
import { isCashSession, parseCashOpen } from "@/modules/cash/live-contract";
export const POST = (request: NextRequest) =>
  endpoint(request, {
    path: "operational/cash-sessions",
    method: "POST",
    parse: parseCashOpen,
    validate: isCashSession,
    idempotent: true,
    requestId: true,
    bindFinancialActor: true,
    errorMessages: financialErrors,
  });
