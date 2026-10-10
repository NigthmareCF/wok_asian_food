const isUuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export type QuoteLine = { menuItemId: string; quantity: number; modifierIds?: string[] };
export type QuoteSelection = { quoteId: string; items: QuoteLine[] };
export type QuoteReceipt = {
  quoteId: string; status: string; expiresAt: string; message: string;
  subtotal?: number; currency?: string; totalEtaSeconds?: number;
};
export type ServicePolicy = {
  version: number; holdMinutes: number; tableLastArrival: string; deliveryReviewFrom: string;
  pickupLastArrival: string; pickupNewPreparationUntil: string;
};
export function record(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }
export type ModifierGroup={id:string;name:string;minSelection:number;maxSelection:number;required:boolean;options:{id:string;name:string;priceDelta:number}[]};
export function isGroups(v:unknown):v is ModifierGroup[]{return Array.isArray(v)&&v.every(g=>record(g)&&isUuid(g.id)&&typeof g.name==="string"&&Number.isSafeInteger(g.minSelection)&&Number.isSafeInteger(g.maxSelection)&&typeof g.required==="boolean"&&Array.isArray(g.options)&&g.options.every(o=>record(o)&&isUuid(o.id)&&typeof o.name==="string"&&typeof o.priceDelta==="number"&&Number.isFinite(o.priceDelta)));}
export function parseLines(v: unknown, empty = false): QuoteLine[] | null {
  if (!Array.isArray(v) || v.length > 20 || (!empty && !v.length)) return null;
  const result: QuoteLine[] = [];
  for (const line of v) {
    if (!record(line) || !isUuid(line.menuItemId) || !Number.isSafeInteger(line.quantity) || Number(line.quantity) < 1 || Number(line.quantity) > 50) return null;
    if (line.modifierIds !== undefined && (!Array.isArray(line.modifierIds) || line.modifierIds.length > 30 || !line.modifierIds.every(isUuid))) return null;
    result.push({ menuItemId: line.menuItemId, quantity: Number(line.quantity), ...(line.modifierIds === undefined ? {} : { modifierIds: [...line.modifierIds as string[]].sort() }) });
  }
  return new Set(result.map(l => l.menuItemId)).size === result.length ? result : null;
}
export function isQuote(v: unknown): v is QuoteReceipt {
  return record(v) && isUuid(v.quoteId) && ["ACTIVE", "CONSUMED", "EXPIRED"].includes(String(v.status))
    && typeof v.expiresAt === "string" && Number.isFinite(Date.parse(v.expiresAt)) && typeof v.message === "string"
    && (v.subtotal === undefined || typeof v.subtotal === "number" && Number.isFinite(v.subtotal) && v.subtotal >= 0)
    && (v.currency === undefined || v.currency===null || typeof v.currency === "string" && /^[A-Z]{3}$/.test(v.currency));
}
export function isPolicy(v: unknown): v is ServicePolicy {
  return record(v) && Number.isSafeInteger(v.version) && Number(v.version) > 0
    && Number.isSafeInteger(v.holdMinutes) && Number(v.holdMinutes) >= 1 && Number(v.holdMinutes) <= 60
    && [v.tableLastArrival, v.deliveryReviewFrom, v.pickupLastArrival, v.pickupNewPreparationUntil].every(t => typeof t === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(t));
}
export function parseQuote(v: unknown) {
  if (!record(v) || !["PICKUP", "DELIVERY"].includes(String(v.fulfillmentType)) || typeof v.requestedFor !== "string" || !Number.isFinite(Date.parse(v.requestedFor))) return null;
  const items = parseLines(v.items); return items ? { fulfillmentType: v.fulfillmentType, requestedFor: v.requestedFor, items } : null;
}
export function parseReservationQuote(v: unknown) {
  if (!record(v) || !Number.isSafeInteger(v.guests) || Number(v.guests) < 1 || Number(v.guests) > 50 || typeof v.preorder !== "boolean" || typeof v.requestedAt !== "string" || !Number.isFinite(Date.parse(v.requestedAt))) return null;
  const items = parseLines(v.items, true); return items ? { guests: v.guests, requestedAt: v.requestedAt, preorder: v.preorder, items } : null;
}
export type PrintedDocument = { orderId: string; title: string; notice: string; html: string };
export function isDocument(v: unknown): v is PrintedDocument { return record(v) && isUuid(v.orderId) && typeof v.title === "string" && typeof v.html === "string" && v.notice === "COMPROBANTE / PRECUENTA — NO ES DTE — NO FEL CERTIFICADO"; }
export type Substitution = {
  originalName?:string; originalUnitPrice?:number; id: string; orderRequestId: string|null; preorder?:boolean; reservationId?:string|null; replacementName: string; quantity: number; replacementUnitPrice: number;
  priceDifference: number; currency: string; status: string; financialResolution: string; manualReview: boolean;
  version: number; expiresAt: string; reason: string;
};
export function isSubstitution(v: unknown): v is Substitution {return record(v) && isUuid(v.id) && (isUuid(v.orderRequestId)||v.orderRequestId===null&&isUuid(v.reservationId)) && typeof v.replacementName === "string"
  && Number.isSafeInteger(v.quantity) && Number(v.quantity)>0 && typeof v.replacementUnitPrice === "number" && Number.isFinite(v.replacementUnitPrice)
  && typeof v.priceDifference === "number" && Number.isFinite(v.priceDifference) && typeof v.currency === "string" && typeof v.status === "string"
  && typeof v.financialResolution === "string" && typeof v.manualReview === "boolean" && Number.isSafeInteger(v.version) && Number(v.version)>0 && typeof v.expiresAt === "string" && typeof v.reason === "string";}
