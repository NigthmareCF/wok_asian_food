"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { useClientIdentity } from "@/modules/clients/use-client-identity";
import { createClientOperation } from "@/modules/clients/client-identity-store";
import { isQuote, type QuoteLine, type QuoteReceipt, type QuoteSelection } from "./contract";
import {ModifierChoices} from "./modifier-choices";
const expired=(value:string)=>Date.parse(value)<=Date.now();
type Props = { userId: string; items: QuoteLine[]; requestedFor: string; fulfillment?: "PICKUP"|"DELIVERY"; guests?:number; preorder?:boolean; onSelection:(v:QuoteSelection|null)=>void };
export function QuotePanel({userId,items,requestedFor,fulfillment,guests,preorder,onSelection}:Props) {
  const {identity,verified}=useClientIdentity(userId);
  const [quote,setQuote]=useState<QuoteReceipt|null>(null);
  const [quoteBody,setQuoteBody]=useState("");
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [accepted,setAccepted]=useState(false);
  const [modifiers,setModifiers]=useState<Record<string,string[]>>({});
  const selectedItems=items.map(item=>({...item,modifierIds:modifiers[item.menuItemId]??item.modifierIds??[]}));
  const sending=useRef(false);const pending=useRef<{key:string;body:string}|null>(null);
  const callback=useRef(onSelection);useEffect(()=>{callback.current=onSelection;},[onSelection]);
  const body=JSON.stringify(fulfillment?{fulfillmentType:fulfillment,requestedFor,items:selectedItems}:{guests,requestedAt:requestedFor,preorder:Boolean(preorder),items:selectedItems});
  useEffect(()=>{let active=true;void Promise.resolve().then(()=>{if(active){setAccepted(false);callback.current(null);pending.current=null;}});return()=>{active=false;};},[body,userId]);
  async function create() {
    if(!verified||sending.current)return;
    const operation=createClientOperation(identity);sending.current=true;setBusy(true);setError("");
    try {
      if(!(await operation.confirm()))return;
      if(!pending.current||pending.current.body!==body)pending.current={key:crypto.randomUUID(),body};
      const response=await fetch(`/bff/core/client/${fulfillment?"order-quotes":"reservation-quotes"}`,{method:"POST",
        headers:{"Content-Type":"application/json","Idempotency-Key":pending.current.key,"X-Wok-Expected-Principal":userId},body:pending.current.body,signal:operation.signal});
      const value:unknown=await response.json();if(!(await operation.confirm()))return;
      if(!response.ok||!isQuote(value))throw new Error(value&&typeof value==="object"&&"message" in value?String(value.message):"No pudimos recuperar la cotización.");
      if(value.status!=="ACTIVE"||expired(value.expiresAt)){pending.current=null;throw new Error("La cotización venció. Cotiza otra vez.");}
      setQuote(value);setQuoteBody(body);setAccepted(false);callback.current(null);
    }catch(cause){if(operation.valid())setError(cause instanceof Error?cause.message:"No pudimos cotizar. Reintenta.");}
    finally{operation.dispose();sending.current=false;setBusy(false);}
  }
  return <section aria-label="Cotización del servidor">
    {selectedItems.map(item=><ModifierChoices key={item.menuItemId} menuItemId={item.menuItemId} selected={item.modifierIds} onChange={ids=>setModifiers(current=>({...current,[item.menuItemId]:ids}))}/>)}
    <p>El carrito y cotizar no reservan. Al aceptar esta cotización y enviar formalmente se crea un hold temporal; no se realiza un cobro.</p>
    <Button type="button" variant="secondary" disabled={busy||!verified} onClick={()=>void create()}>{busy?"Cotizando…":"Cotizar con el servidor"}</Button>
    {quote&&quoteBody===body?<><p>{quote.message}</p>{quote.subtotal!==undefined&&quote.currency?<p>Total cotizado: {quote.currency} {quote.subtotal.toFixed(2)} · ETA {Math.ceil((quote.totalEtaSeconds??0)/60)} min</p>:null}
      <p>Vigente hasta {new Date(quote.expiresAt).toLocaleString("es-GT",{timeZone:"America/Guatemala"})}.</p>
      <label><input type="checkbox" checked={accepted} onChange={e=>{const next=e.target.checked&&!expired(quote.expiresAt);setAccepted(next);callback.current(next?{quoteId:quote.quoteId,items:selectedItems}:null);}}/>Acepto esta cotización para continuar formalmente con la solicitud.</label></>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
