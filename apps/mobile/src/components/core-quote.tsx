import {useEffect,useRef,useState} from "react";
import * as SecureStore from "expo-secure-store";
import {randomUUID} from "expo-crypto";
import {Platform,Text,View} from "react-native";
import {Button,Card,Notice,useUiTheme} from "./ui";
import {useSession} from "@/providers/session-provider";
import {apiRequest,ApiError} from "@/lib/api";
import {requestFreshOrderQuote} from "@/lib/order-quotes";
import type {QuoteLine,QuoteSelection} from "@/lib/quote-selection";
export type {QuoteLine,QuoteSelection} from "@/lib/quote-selection";
type Quote={quoteId:string;status:"ACTIVE"|"CONSUMED"|"EXPIRED";expiresAt:string;usable:boolean;message:string;subtotal?:number;currency?:string;totalEtaSeconds?:number};
type Group={id:string;name:string;required:boolean;minSelection:number;maxSelection:number;options:{id:string;name:string;priceDelta:number}[]};
export function CoreQuote(props:{items:QuoteLine[];requestedFor:string;fulfillment?:"PICKUP"|"DELIVERY";guests?:number;preorder?:boolean;onSelection:(v:QuoteSelection|null)=>void}) {
 const {session}=useSession();return <OwnedQuote key={`${session?.email}:${session?.version}`} {...props}/>;
}
function OwnedQuote({items,requestedFor,fulfillment,guests,preorder,onSelection}:{items:QuoteLine[];requestedFor:string;fulfillment?:"PICKUP"|"DELIVERY";guests?:number;preorder?:boolean;onSelection:(v:QuoteSelection|null)=>void}) {
 const {ui}=useUiTheme();
 const {session,request}=useSession();const [quote,setQuote]=useState<Quote|null>(null);const [accepted,setAccepted]=useState(false);
 const [options,setOptions]=useState<Record<string,string[]>>({});const [groups,setGroups]=useState<Record<string,Group[]>>({});
 const webPending=useRef<{key:string;body:string}|null>(null);
 const [quoteBody,setQuoteBody]=useState("");
 const [error,setError]=useState("");const [busy,setBusy]=useState(false);const lock=useRef(false);const callback=useRef(onSelection);useEffect(()=>{callback.current=onSelection;},[onSelection]);
 const lines=items.map(item=>({...item,modifierIds:options[item.menuItemId]??item.modifierIds??[]}));
 const body=JSON.stringify(fulfillment?{fulfillmentType:fulfillment,requestedFor,items:lines}:{guests,requestedAt:requestedFor,preorder:Boolean(preorder),items:lines});
 const itemIds=JSON.stringify(items.map(i=>i.menuItemId));
 useEffect(()=>{let active=true;Promise.all((JSON.parse(itemIds) as string[]).map(async id=>[id,await apiRequest<Group[]>(`/api/v1/public/menu/${id}/modifiers`)] as const)).then(values=>{if(active)setGroups(Object.fromEntries(values));}).catch(()=>{if(active)setError("No pudimos consultar las opciones de los productos.");});return()=>{active=false;};},[itemIds]);
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>{if(active){setAccepted(false);callback.current(null);}});return()=>{active=false;};},[body]);
 async function create(){if(!session||session.offline||lock.current)return;lock.current=true;setBusy(true);setError("");
  try{const storage=`wok.core.quote.${fulfillment??"reservation"}.${session.email}`;const raw=Platform.OS==="web"?(webPending.current?JSON.stringify(webPending.current):null):await SecureStore.getItemAsync(storage);let pending:{key?:string;body?:string}|null=null;try{pending=raw?JSON.parse(raw):null;}catch{/* A malformed estimate never reserves. */}
   const result=await requestFreshOrderQuote(async key=>{const value=await request<Quote>(`/api/v1/client/${fulfillment?"order-quotes":"reservation-quotes"}`,{method:"POST",headers:{"Idempotency-Key":key},body});
     if(!value||!/^([0-9a-f-]{36})$/i.test(value.quoteId)||!Number.isFinite(Date.parse(value.expiresAt))||!["ACTIVE","CONSUMED","EXPIRED"].includes(value.status))throw new ApiError("Cotización inválida.",503);
     return {...value,usable:value.status==="ACTIVE"&&Date.parse(value.expiresAt)>Date.now()};},pending?.body===body?pending.key:undefined,false,quote,randomUUID,
     async key=>{if(Platform.OS==="web")webPending.current={key,body};else await SecureStore.setItemAsync(storage,JSON.stringify({key,body}));});
   setQuote(result.quote);setQuoteBody(body);setAccepted(false);callback.current(null);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo cotizar.");}finally{lock.current=false;setBusy(false);}}
 return <Card><Text style={ui.body}>El carrito y cotizar no reservan. Al aceptar y enviar formalmente se crea un hold temporal sin cobro.</Text>
  {lines.map(line=><View key={line.menuItemId}>{(groups[line.menuItemId]??[]).map(group=><View key={group.id}><Text style={ui.body}>{group.name} · {group.required?"obligatorio":"opcional"} · {group.minSelection}–{group.maxSelection}</Text>{group.options.map(option=><Button key={option.id} title={`${line.modifierIds.includes(option.id)?"✓ ":""}${option.name} (+${option.priceDelta.toFixed(2)})`} secondary onPress={()=>setOptions(current=>({...current,[line.menuItemId]:line.modifierIds.includes(option.id)?line.modifierIds.filter(id=>id!==option.id):[...line.modifierIds,option.id]}))}/>)}</View>)}</View>)}
  <Button title="Cotizar con el servidor" secondary busy={busy} disabled={!session||session.offline} onPress={()=>void create()}/>
  {quote&&quoteBody===body?<><Notice>{quote.message}</Notice>{quote.subtotal!==undefined&&quote.currency?<Text style={ui.body}>Total cotizado: {quote.currency} {quote.subtotal.toFixed(2)} · ETA {Math.ceil((quote.totalEtaSeconds??0)/60)} min</Text>:null}
   <Text style={ui.body}>Vigente hasta {new Date(quote.expiresAt).toLocaleString("es-GT",{timeZone:"America/Guatemala"})}.</Text>
   <Button title={accepted?"Cotización aceptada · Cambiar":"Aceptar cotización para continuar"} secondary onPress={()=>{const next=!accepted&&quote.status==="ACTIVE"&&quote.usable&&Date.parse(quote.expiresAt)>Date.now();setAccepted(next);callback.current(next&&session?{quoteId:quote.quoteId,items:lines,ownerEmail:session.email,expiresAt:quote.expiresAt,requestedFor,fulfillment,guests,preorder}:null);}}/></>:null}
  {error?<Notice tone="error">{error}</Notice>:null}</Card>;
}
