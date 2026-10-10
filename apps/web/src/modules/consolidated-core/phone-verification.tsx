"use client";
import {useState} from "react";
import {Button} from "@/shared/components/ui/button";
import {useClientIdentity} from "@/modules/clients/use-client-identity";
import {createClientOperation} from "@/modules/clients/client-identity-store";
import {record} from "./contract";
export function PhoneVerification({userId,phone}:{userId:string;phone:string}) {
 const {identity,verified}=useClientIdentity(userId);const [challenge,setChallenge]=useState("");const [code,setCode]=useState("");const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
 async function run(confirm:boolean){if(!verified||busy)return;const operation=createClientOperation(identity);setBusy(true);setMessage("");
  try{if(!(await operation.confirm()))return;const response=await fetch(`/bff/core/client/phone-verification${confirm?"/confirm":""}`,{method:"POST",headers:{"Content-Type":"application/json","X-Wok-Expected-Principal":userId},body:JSON.stringify(confirm?{challengeId:challenge,code}:{phone}),signal:operation.signal});
   const value:unknown=await response.json();if(!(await operation.confirm()))return;if(!response.ok||!record(value))throw new Error(record(value)&&typeof value.message==="string"?value.message:"Verificación no disponible.");
   if(confirm){setCode("");setMessage(value.verified===true?"Teléfono verificado para delivery.":"El adapter de pruebas no acredita posesión real. Delivery permanece bloqueado.");}
   else{setChallenge(String(value.challengeId));setMessage("Código solicitado. Caduca en cinco minutos; no lo compartas.");}
  }catch(e){if(operation.valid())setMessage(e instanceof Error?e.message:"Verificación no disponible.");}finally{operation.dispose();setBusy(false);}}
 return <section aria-label="Verificación del teléfono"><p>Delivery requiere verificar el número exacto guardado en tu perfil. Cambiarlo invalida su verificación. Si el canal real no está disponible, no podrás enviar delivery.</p>
 <Button type="button" variant="secondary" disabled={busy||!phone||!verified} onClick={()=>void run(false)}>Solicitar código telefónico</Button>
 {challenge?<><label>Código de seis dígitos<input value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="one-time-code"/></label><Button type="button" disabled={busy||!/^\d{6}$/.test(code)} onClick={()=>void run(true)}>Verificar teléfono</Button></>:null}
 {message?<p role="status">{message}</p>:null}</section>;
}
