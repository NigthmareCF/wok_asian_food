"use client";
import {useState} from "react";
import {Button} from "@/shared/components/ui/button";
import {useClientPickupResource} from "@/modules/client-order-tracking/use-client-pickup-resource";
import {useSubmission} from "@/modules/client-workflows/use-submission";
import {isPolicy,record,type ServicePolicy} from "./contract";
const parse=(v:unknown)=>record(v)&&isPolicy({...v,version:v.expectedVersion})&&typeof v.reason==="string"&&v.reason.trim().length>=3? v:null;
export function PolicySettings({userId}:{userId:string}) {
 const resource=useClientPickupResource("/bff/core/public/service-policy",isPolicy,userId,0);
 return <section><h2>Política operativa del backend</h2><Button variant="secondary" onClick={resource.reload}>Consultar política vigente</Button>
  {resource.data?<PolicyForm key={resource.data.version} current={resource.data} userId={userId} reload={resource.reload}/>:null}
  {resource.error?<p role="alert">{resource.error.message}</p>:null}</section>;
}
function PolicyForm({current,userId,reload}:{current:ServicePolicy;userId:string;reload:()=>void}) {
 const [draft,setDraft]=useState({...current});const [reason,setReason]=useState("");
 const submission=useSubmission(`wok.service-policy:${userId}`,"/bff/core/admin/service-policy",parse,isPolicy,userId,"PUT");
 const times:[keyof ServicePolicy,string][]=[["tableLastArrival","Última llegada de reserva"],["deliveryReviewFrom","Delivery requiere revisión desde"],["pickupLastArrival","Última recogida normal"],["pickupNewPreparationUntil","Nueva preparación pickup hasta"]];
 return <form onSubmit={e=>{e.preventDefault();void submission.send({...draft,expectedVersion:current.version,reason}).then(result=>{if(result){submission.clear();reload();}});}}>
  <p>Reserva mínima: 120 + 15 × ceil(max(comensales − 4, 0) / 2). La evaluación puede exigir más o revisión. Versión {current.version}.</p>
  <label>Duración del hold (minutos)<input type="number" min={1} max={60} value={draft.holdMinutes} disabled={submission.busy||!!submission.attempt} onChange={e=>setDraft({...draft,holdMinutes:Number(e.target.value)})}/></label>
  {times.map(([field,label])=><label key={field}>{label}<input type="time" value={String(draft[field]).slice(0,5)} disabled={submission.busy||!!submission.attempt} onChange={e=>setDraft({...draft,[field]:e.target.value})}/></label>)}
  <label>Motivo auditado<input value={reason} minLength={3} maxLength={500} required disabled={submission.busy||!!submission.attempt} onChange={e=>setReason(e.target.value)}/></label>
  <Button type="submit" disabled={submission.busy}>{submission.attempt?"Reintentar la misma actualización":"Guardar política"}</Button>
  {submission.error?<p role="alert">{submission.error}</p>:null}
 </form>;
}
