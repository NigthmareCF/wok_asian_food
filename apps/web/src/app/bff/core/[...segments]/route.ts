import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { isDocument, isPolicy, isQuote, isSubstitution, parseQuote, parseReservationQuote, record } from "@/modules/consolidated-core/contract";
import { isGroups } from "@/modules/consolidated-core/contract";
type Context = { params: Promise<{ segments: string[] }> };
async function handle(request: NextRequest, context: Context) {
  const { segments } = await context.params;
  const path = segments.join("/");
  const method = request.method as "GET" | "POST" | "PUT";
  const uuid = "[0-9a-fA-F-]{36}";
  let parse: ((v: unknown) => unknown) | undefined;
  let validate: (v: unknown) => boolean = () => false;
  let idempotent = false;
  if (path === "public/service-policy" && method === "GET") validate = isPolicy;
  else if (new RegExp(`^public/menu/${uuid}/modifiers$`).test(path) && method === "GET") validate=isGroups;
  else if (path === "admin/service-policy" && method === "PUT") { parse = v => record(v) && isPolicy({...v,version:v.expectedVersion}) && typeof v.reason === "string" ? v : null; validate = isPolicy; idempotent=true; }
  else if (path === "client/order-quotes" && method === "POST") { parse = parseQuote; validate = isQuote; idempotent = true; }
  else if (path === "client/reservation-quotes" && method === "POST") { parse = parseReservationQuote; validate = isQuote; idempotent = true; }
  else if (new RegExp(`^client/(order|reservation)-quotes/${uuid}$`).test(path) && method === "GET") validate = isQuote;
  else if (path === "client/phone-verification" && method === "GET") validate = v => record(v) && typeof v.verified === "boolean" && typeof v.transportAvailable === "boolean";
  else if (path === "client/phone-verification" && method === "POST") {parse = v => record(v) && typeof v.phone === "string" && v.phone.length <= 32 ? {phone:v.phone} : null; validate = v => record(v) && isUuid(v.challengeId) && typeof v.expiresAt === "string";}
  else if (path === "client/phone-verification/confirm" && method === "POST") {parse = v => record(v) && isUuid(v.challengeId) && typeof v.code === "string" && /^[0-9]{6}$/.test(v.code) ? v : null; validate = v => record(v) && typeof v.verified === "boolean" && typeof v.transportAvailable === "boolean";}
  else if (new RegExp(`^(client/order-requests|operational/orders)/${uuid}/documents/(COMMAND|PREBILL|RECEIPT)$`).test(path) && method === "GET") validate = isDocument;
  else if (new RegExp(`^operational/order-requests/${uuid}/(override|logistics-confirmation)$`).test(path) && method === "POST") {parse = v => record(v) && typeof v.reason === "string" && Array.from(v.reason.trim()).length >= 3 && Array.from(v.reason.trim()).length <= 500 ? {reason:v.reason.trim()} : null; validate = v => record(v) && isUuid(v.requestId) && typeof v.status === "string";idempotent=true;}
  else if (new RegExp(`^operational/reservations/${uuid}/preorder-conversion$`).test(path) && method === "POST") {parse = v => record(v) && isUuid(v.accountId) && Number.isSafeInteger(v.expectedVersion) && Number(v.expectedVersion)>0 ? v : null; validate = v => record(v) && isUuid(v.reservationId) && isUuid(v.orderId); idempotent=true;}
  else if (["client/substitutions","operational/substitutions"].includes(path) && method === "GET") validate = v => Array.isArray(v) && v.every(isSubstitution);
  else if (path==="operational/reservations/core" && method==="GET") validate=v=>Array.isArray(v)&&v.every(r=>record(r)&&isUuid(r.id)&&typeof r.status==="string"&&Number.isSafeInteger(r.version)&&Array.isArray(r.tables)&&Array.isArray(r.preorder));
  else if (new RegExp(`^(client|operational)/(substitutions|preorder-substitutions)/${uuid}/decision$`).test(path) && method === "POST") {parse = v => record(v) && Number.isSafeInteger(v.expectedVersion) && Number(v.expectedVersion)>0 && (path.startsWith("client") ? typeof v.accept === "boolean" : typeof v.apply === "boolean" && typeof v.override === "boolean" && typeof v.reason === "string" && Array.from(v.reason.trim()).length >= 3 && Array.from(v.reason.trim()).length <= 500) ? v : null; validate=isSubstitution;idempotent=true;}
  else if (new RegExp(`^operational/(order-requests/${uuid}/substitutions|reservations/${uuid}/(preorder-substitutions|order-substitutions))$`).test(path) && method === "POST") {parse = v => record(v) && isUuid(v.orderItemId) && isUuid(v.replacementMenuItemId) && Number.isSafeInteger(v.expectedOrderVersion) && Number(v.expectedOrderVersion)>0 && typeof v.reason === "string" && Array.from(v.reason.trim()).length >= 3 && Array.from(v.reason.trim()).length<=500 && (v.modifierIds===undefined || Array.isArray(v.modifierIds) && v.modifierIds.length<=30 && v.modifierIds.every(isUuid)) ? v : null;validate=isSubstitution;idempotent=true;}
  else return NextResponse.json({message:"Ruta o método no disponible."},{status:404});
  return endpoint(request,{path,method,parse,validate,idempotent,bindClientPrincipal:!path.startsWith("public/"),
    errorMessages:{410:"La cotización, propuesta o código venció. Actualiza antes de continuar.",429:"Espera antes de repetir esta operación."}});
}
export const GET=handle;
export const POST=handle;
export const PUT=handle;
