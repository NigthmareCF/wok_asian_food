"use client";
import Link from "next/link";
import {Button} from "@/shared/components/ui/button";
import {useClientPickupResource} from "@/modules/client-order-tracking/use-client-pickup-resource";
import {useSubmission} from "@/modules/client-workflows/use-submission";
import {isPickupHistory} from "@/modules/client-order-tracking/pickup-details";
import {isSubstitution,record,type Substitution} from "./contract";
const isSubstitutions=(v:unknown):v is Substitution[]=>Array.isArray(v)&&v.every(isSubstitution);
const parseConsent=(v:unknown)=>record(v)&&typeof v.accept==="boolean"&&Number.isSafeInteger(v.expectedVersion)&&Number(v.expectedVersion)>0?{accept:v.accept,expectedVersion:Number(v.expectedVersion)}:null;
export function ClientCore({userId}:{userId:string}){
 const proposals=useClientPickupResource("/bff/core/client/substitutions",isSubstitutions,userId);
 const history=useClientPickupResource("/bff/order-requests",isPickupHistory,userId);
 return <section><h2>Sustituciones y documentos</h2><Button variant="secondary" onClick={()=>{proposals.reload();history.reload();}}>Actualizar</Button>
  {proposals.error?<p role="alert">{proposals.error.message}</p>:null}
  {proposals.data?.map(item=><ClientConsent key={`${userId}:${item.id}:${item.version}`} item={item} userId={userId} reload={proposals.reload}/>)}
  {history.data?.filter(item=>item.orderId).map(item=><p key={item.requestId}>Pedido {item.requestId.slice(0,8)} · <Link href={`/client/orders/${item.requestId}/documents/PREBILL`}>Precuenta</Link> · <Link href={`/client/orders/${item.requestId}/documents/RECEIPT`}>Comprobante</Link></p>)}
 </section>;
}
function ClientConsent({item,userId,reload}:{item:Substitution;userId:string;reload:()=>void}){
 const submission=useSubmission(`wok.substitution.consent:${userId}:${item.id}`,`/bff/core/client/${item.preorder?"preorder-substitutions":"substitutions"}/${item.id}/decision`,parseConsent,isSubstitution,userId);
 async function decide(accept:boolean){const result=await submission.send({accept,expectedVersion:item.version});if(result)reload();}
 return <article><h3>{item.originalName??"Producto del pedido"} → {item.quantity} × {item.replacementName}</h3><p>{item.reason}</p><p>Precio nuevo {item.currency} {item.replacementUnitPrice.toFixed(2)} · Diferencia {item.currency} {item.priceDifference.toFixed(2)} · {item.status}</p>
  {item.manualReview?<p>La preparación ya comenzó: Operativo debe revisar manualmente.</p>:null}
  {item.financialResolution==="BLOCKED_NO_CONTRACT"?<p>La diferencia pagada requiere resolución financiera. Aceptar conserva tu consentimiento; no genera cargos ni devoluciones.</p>:null}
  {item.status==="PENDING_CONSENT"?<><Button disabled={submission.busy} onClick={()=>void decide(true)}>Aceptar sustitución</Button><Button variant="secondary" disabled={submission.busy} onClick={()=>void decide(false)}>Rechazar sustitución</Button></>:null}
  {submission.error?<p role="alert">{submission.error}</p>:null}
 </article>;
}
