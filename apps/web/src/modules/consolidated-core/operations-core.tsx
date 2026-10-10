"use client";
import Link from "next/link";
import {useState} from "react";
import {Button} from "@/shared/components/ui/button";
import {useClientPickupResource} from "@/modules/client-order-tracking/use-client-pickup-resource";
import {useSubmission} from "@/modules/client-workflows/use-submission";
import {isOperationalOrderRequests,type OperationalOrderRequest} from "@/modules/orders/order-request-contract";
import {isOperationalOrderDetails} from "@/modules/orders/live-contract";
import {usePublicMenu} from "@/modules/menu/use-public-menu";
import {isUuid} from "@/modules/checkout/pickup-contract";
import {isSubstitution,record,type Substitution} from "./contract";
import {ModifierChoices} from "./modifier-choices";
type Reservation={id:string;status:string;guests:number;requestedAt:string;version:number;preorderOrderId:string|null;tables:{id:string;name:string;accountId:string|null}[];preorder:{id:string;name:string;quantity:number}[]};
const reservations=(v:unknown):v is Reservation[]=>Array.isArray(v)&&v.every(r=>record(r)&&isUuid(r.id)&&Number.isSafeInteger(r.version)&&typeof r.status==="string"&&Array.isArray(r.tables)&&r.tables.every(t=>record(t)&&isUuid(t.id)&&typeof t.name==="string"&&(t.accountId==null||isUuid(t.accountId)))&&Array.isArray(r.preorder));
const substitutions=(v:unknown):v is Substitution[]=>Array.isArray(v)&&v.every(isSubstitution);
const receipt=(v:unknown):v is Record<string,unknown>=>record(v)&&(isUuid(v.id)||isUuid(v.requestId)||isUuid(v.reservationId));
const parse=(v:unknown)=>record(v)?v:null;
export function OperationsCore({userId,canOverride}:{userId:string;canOverride:boolean}){
 const requests=useClientPickupResource("/bff/operational/order-requests",isOperationalOrderRequests,userId);
 const agenda=useClientPickupResource("/bff/core/operational/reservations/core",reservations,userId);
 const proposals=useClientPickupResource("/bff/core/operational/substitutions",substitutions,userId);
 const reload=()=>{requests.reload();agenda.reload();proposals.reload();};
 return <section><h1>Revisión del core consolidado</h1><p>Las excepciones requieren motivo y autorización vigentes. Confirmar logística no acepta el pedido. La preorden entra a cocina solo al convertirla explícitamente.</p>
  <Button variant="secondary" onClick={reload}>Actualizar solicitudes, reservas y sustituciones</Button>
  {[requests.error,agenda.error,proposals.error].filter(Boolean).map((e,i)=><p role="alert" key={i}>{e!.message}</p>)}
  <h2>Solicitudes de pickup y delivery</h2>{requests.data?.map(r=><RequestCard key={r.requestId} item={r} userId={userId} canOverride={canOverride} reload={reload}/>)}
  <h2>Preórdenes de reservas</h2>{agenda.data?.map(r=><ReservationCard key={`${r.id}:${r.version}`} item={r} userId={userId} reload={reload}/>)}
  <h2>Sustituciones consentidas</h2>{proposals.data?.filter(p=>["PENDING_CONSENT","CONSENTED","FINANCIAL_REVIEW_REQUIRED"].includes(p.status)).map(p=><SubstitutionDecision key={`${p.id}:${p.version}`} item={p} userId={userId} canOverride={canOverride} reload={reload}/>)}
 </section>;
}
function CoreAction({userId,path,payload,label,reload,disabled=false}:{userId:string;path:string;payload:Record<string,unknown>;label:string;reload:()=>void;disabled?:boolean}){
 const action=useSubmission(`wok.core.action:${userId}:${path}`,`/bff/core/${path}`,parse,receipt,userId);
 return <div><Button disabled={disabled||action.busy} onClick={()=>void action.send(payload).then(result=>{if(result)reload();})}>{action.attempt&&!action.attempt.receipt?"Reintentar la misma acción":label}</Button>
  {action.attempt?.receipt?<><p role="status">Acción registrada.</p><Button variant="secondary" onClick={action.clear}>Cerrar resultado</Button></>:null}{action.error?<p role="alert">{action.error}</p>:null}</div>;
}
function RequestCard({item,userId,canOverride,reload}:{item:OperationalOrderRequest;userId:string;canOverride:boolean;reload:()=>void}){
 const [reason,setReason]=useState("");
 return <article><h3>{item.customerName} · {item.fulfillmentType} · {item.status}</h3><p>{new Date(item.requestedFor).toLocaleString("es-GT",{timeZone:"America/Guatemala"})}</p>
 {item.status==="PENDING_REVIEW"?<><label>Motivo de revisión<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label>
  {item.fulfillmentType==="DELIVERY"?<CoreAction userId={userId} path={`operational/order-requests/${item.requestId}/logistics-confirmation`} payload={{reason}} label="Confirmar logística" disabled={Array.from(reason.trim()).length<3} reload={reload}/>:null}
  {canOverride?<CoreAction userId={userId} path={`operational/order-requests/${item.requestId}/override`} payload={{reason}} label="Registrar override ADMIN" disabled={Array.from(reason.trim()).length<3} reload={reload}/>:null}
  <Link href="/operation/orders">Revisar aceptación o rechazo en Pedidos</Link></>:null}
 {item.orderId?<><p><Link href={`/operation/orders/${item.orderId}/documents/COMMAND`}>Comanda imprimible</Link> · <Link href={`/operation/orders/${item.orderId}/documents/PREBILL`}>Precuenta</Link> · <Link href={`/operation/orders/${item.orderId}/documents/RECEIPT`}>Comprobante</Link></p>
  {item.status==="ACCEPTED"?<SubstitutionProposal requestId={item.requestId} orderId={item.orderId} userId={userId} reload={reload}/>:null}</>:null}</article>;
}
function SubstitutionProposal({requestId,orderId,userId,reload,reservation=false}:{requestId:string;orderId:string;userId:string;reload:()=>void;reservation?:boolean}){
 const order=useClientPickupResource(`/bff/operational/orders/${orderId}`,isOperationalOrderDetails,userId,0);
 const {menu}=usePublicMenu();const products=menu?.categories.flatMap(c=>c.items)??[];
 const [item,setItem]=useState("");const [replacement,setReplacement]=useState("");const [reason,setReason]=useState("");const [modifiers,setModifiers]=useState<string[]>([]);
 if(!order.data)return null;
 return <details><summary>Proponer sustitución por agotado</summary><label>Línea original<select value={item} onChange={e=>setItem(e.target.value)}><option value="">Seleccionar</option>{order.data.items.map(i=><option key={i.id} value={i.id}>{i.quantity} × {i.name}</option>)}</select></label>
  <label>Producto sustituto<select value={replacement} onChange={e=>{setReplacement(e.target.value);setModifiers([]);}}><option value="">Seleccionar</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  {replacement?<ModifierChoices menuItemId={replacement} selected={modifiers} onChange={setModifiers}/>:null}
  <label>Motivo<input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}/></label>
  <CoreAction userId={userId} path={reservation?`operational/reservations/${requestId}/order-substitutions`:`operational/order-requests/${requestId}/substitutions`} payload={{orderItemId:item,replacementMenuItemId:replacement,modifierIds:modifiers,expectedOrderVersion:order.data.order.rowVersion,reason}} disabled={!item||!replacement||Array.from(reason.trim()).length<3} label="Enviar propuesta al cliente" reload={reload}/>
 </details>;
}
function ReservationCard({item,userId,reload}:{item:Reservation;userId:string;reload:()=>void}){
 const [account,setAccount]=useState(item.tables.find(t=>t.accountId)?.accountId??"");
 return <article><h3>{item.guests} personas · {item.status}</h3><p>{item.preorder.map(l=>`${l.quantity} × ${l.name}`).join(", ")||"Sin preorden"}</p>
 {item.preorderOrderId?<><Link href={`/operation/orders/${item.preorderOrderId}`}>Ver pedido convertido</Link><SubstitutionProposal reservation requestId={item.id} orderId={item.preorderOrderId} userId={userId} reload={reload}/></>:item.preorder.length&&["CONFIRMED","ARRIVED","SEATED"].includes(item.status)?<>
  <label>Cuenta de mesa asignada<select value={account} onChange={e=>setAccount(e.target.value)}><option value="">Seleccionar cuenta abierta</option>{item.tables.filter(t=>t.accountId).map(t=><option key={t.id} value={t.accountId!}>{t.name}</option>)}</select></label>
  <Link href="/operation/tables">Abrir cuenta de la mesa asignada</Link>
  <CoreAction userId={userId} path={`operational/reservations/${item.id}/preorder-conversion`} payload={{accountId:account,expectedVersion:item.version}} disabled={!account} label="Check-in y convertir preorden a cocina" reload={reload}/>
 </>:null}{!item.preorderOrderId&&["CONFIRMED","ARRIVED","SEATED"].includes(item.status)&&item.preorder.length?<PreorderProposal item={item} userId={userId} reload={reload}/>:null}</article>;
}
function SubstitutionDecision({item,userId,canOverride,reload}:{item:Substitution;userId:string;canOverride:boolean;reload:()=>void}){
 const [reason,setReason]=useState("");const [override,setOverride]=useState(false);
 const decision=useSubmission(`wok.core.substitution:${userId}:${item.id}`,`/bff/core/operational/${item.preorder?"preorder-substitutions":"substitutions"}/${item.id}/decision`,parse,isSubstitution,userId);
 async function decide(apply:boolean){const result=await decision.send({apply,expectedVersion:item.version,override:apply&&override,reason});if(result)reload();}
 return <article><h3>{item.quantity} × {item.replacementName} · {item.status}</h3><p>Diferencia {item.currency} {item.priceDifference.toFixed(2)} · {item.financialResolution}</p>
 {item.financialResolution==="BLOCKED_NO_CONTRACT"?<p>Falta un contrato real de ajuste/devolución. No aplicar ni registrar pagos ficticios.</p>:null}
 <label>Motivo de decisión<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label>
 {canOverride&&item.manualReview?<label><input type="checkbox" checked={override} onChange={e=>setOverride(e.target.checked)}/>Override ADMIN: revisar y reiniciar explícitamente la preparación de este pedido.</label>:null}
 <Button disabled={decision.busy||item.status!=="CONSENTED"||Array.from(reason.trim()).length<3||item.manualReview&&!override} onClick={()=>void decide(true)}>{decision.attempt?"Reintentar la misma decisión":"Aplicar sustitución consentida"}</Button>
 <Button variant="secondary" disabled={decision.busy||!!decision.attempt||Array.from(reason.trim()).length<3} onClick={()=>void decide(false)}>Rechazar propuesta</Button>
 {decision.error?<p role="alert">{decision.error}</p>:null}
 </article>;
}

function PreorderProposal({item,userId,reload}:{item:Reservation;userId:string;reload:()=>void}){
 const {menu}=usePublicMenu();const [line,setLine]=useState("");const [replacement,setReplacement]=useState("");const [reason,setReason]=useState("");const [modifiers,setModifiers]=useState<string[]>([]);
 return <details><summary>Proponer sustitución de preorden al cliente</summary><label>Línea<select value={line} onChange={e=>setLine(e.target.value)}><option value="">Seleccionar</option>{item.preorder.map(p=><option key={p.id} value={p.id}>{p.quantity} × {p.name}</option>)}</select></label>
 <label>Alternativa<select value={replacement} onChange={e=>{setReplacement(e.target.value);setModifiers([]);}}><option value="">Seleccionar</option>{menu?.categories.flatMap(c=>c.items).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 {replacement?<ModifierChoices menuItemId={replacement} selected={modifiers} onChange={setModifiers}/>:null}<label>Motivo<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label>
 <CoreAction userId={userId} path={`operational/reservations/${item.id}/preorder-substitutions`} payload={{orderItemId:line,replacementMenuItemId:replacement,modifierIds:modifiers,expectedOrderVersion:item.version,reason}} disabled={!line||!replacement||Array.from(reason.trim()).length<3} label="Solicitar consentimiento sin enviar a cocina" reload={reload}/></details>;
}
