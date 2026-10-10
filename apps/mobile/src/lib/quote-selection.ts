export type QuoteLine = {menuItemId:string;quantity:number;modifierIds?:string[]};
export type QuoteSelection = {
  quoteId:string;items:QuoteLine[];ownerEmail:string;expiresAt:string;requestedFor:string;
  fulfillment?:"PICKUP"|"DELIVERY";guests?:number;preorder?:boolean;
};
export function quoteSelectionMatches(selection:QuoteSelection|null, input:{
  ownerEmail:string;items:QuoteLine[];requestedFor:string;
  fulfillment?:"PICKUP"|"DELIVERY";guests?:number;preorder?:boolean;
}, now=Date.now()):boolean {
  if(!selection || selection.ownerEmail!==input.ownerEmail ||
    selection.requestedFor!==input.requestedFor || selection.fulfillment!==input.fulfillment ||
    selection.guests!==input.guests || Boolean(selection.preorder)!==Boolean(input.preorder) ||
    !Number.isFinite(Date.parse(selection.expiresAt)) || Date.parse(selection.expiresAt)<=now) return false;
  const lines=(items:QuoteLine[])=>JSON.stringify(items.map(i=>[i.menuItemId,i.quantity]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
  return lines(selection.items)===lines(input.items);
}
