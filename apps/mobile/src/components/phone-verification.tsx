import {useState} from "react";
import {Button,Card,Field,Notice} from "./ui";
import {useSession} from "@/providers/session-provider";
export function PhoneVerification({phone}:{phone:string}){const {session}=useSession();return <OwnedPhone key={`${session?.email}:${session?.version}`} phone={phone}/>;}
function OwnedPhone({phone}:{phone:string}) {
 const {session,request}=useSession();const [challenge,setChallenge]=useState("");const [code,setCode]=useState("");const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
 async function run(confirm:boolean){if(!session||busy)return;setBusy(true);setMessage("");try{
  if(confirm){const status=await request<{verified:boolean}>("/api/v1/client/phone-verification/confirm",{method:"POST",body:JSON.stringify({challengeId:challenge,code})});setCode("");setMessage(status.verified?"Teléfono verificado para delivery.":"La prueba no acredita posesión real; delivery sigue bloqueado.");}
  else{const value=await request<{challengeId:string}>("/api/v1/client/phone-verification",{method:"POST",body:JSON.stringify({phone})});setChallenge(value.challengeId);setMessage("Código solicitado. Caduca en cinco minutos.");}
 }catch(e){setMessage(e instanceof Error?e.message:"Verificación no disponible.");}finally{setBusy(false);}}
 return <Card><Notice>Delivery requiere verificar el teléfono exacto con código de país guardado en Mi cuenta. Cambiarlo invalida la verificación. Sin canal real autorizado, delivery está bloqueado.</Notice>
 <Button title="Solicitar código telefónico" secondary busy={busy} disabled={!phone||!session} onPress={()=>void run(false)}/>
 {challenge?<><Field label="Código de seis dígitos" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6}/><Button title="Verificar teléfono" disabled={busy||!/^\d{6}$/.test(code)} onPress={()=>void run(true)}/></>:null}
 {message?<Notice>{message}</Notice>:null}</Card>;
}
