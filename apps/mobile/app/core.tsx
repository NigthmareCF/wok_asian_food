import {useCallback,useEffect,useRef,useState} from "react";
import {ScrollView,Text,Share,Platform} from "react-native";
import * as SecureStore from "expo-secure-store";
import {randomUUID} from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import {Button,Card,Heading,Notice,Page,useUiTheme} from "@/components/ui";
import {useSession} from "@/providers/session-provider";
import {ApiError} from "@/lib/api";

type Substitution={originalName?:string;originalUnitPrice?:number;id:string;orderRequestId:string|null;reservationId?:string|null;preorder?:boolean;replacementName:string;quantity:number;priceDifference:number;currency:string;status:string;financialResolution:string;version:number;expiresAt:string;reason:string};
type OrderRequest={requestId:string;status:string};
type Document={title:string;notice:string;html:string};
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v);
const pendingKey=(email:string,id:string)=>`wok.substitution.${encodeURIComponent(email).replace(/%/g,"_")}.${id}`;

export default function CoreScreen(){const {session}=useSession();return <OwnedCore key={`${session?.email}:${session?.version}`}/>;}
function OwnedCore(){
 const {ui}=useUiTheme();
 const {session,request}=useSession();const [substitutions,setSubstitutions]=useState<Substitution[]>([]);const [orders,setOrders]=useState<OrderRequest[]>([]);
 const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [document,setDocument]=useState<Document|null>(null);const lock=useRef(false);
 const refresh=useCallback(async()=>{if(!session)return;setError("");try{
   const [proposals,pickup,delivery]=await Promise.all([request<Substitution[]>("/api/v1/client/substitutions"),request<OrderRequest[]>("/api/v1/client/order-requests"),request<OrderRequest[]>("/api/v1/client/delivery-requests")]);
   if(!Array.isArray(pickup)||!Array.isArray(delivery))throw new Error("No pudimos validar los pedidos.");
   const requests=[...pickup,...delivery];
   if(!Array.isArray(proposals)||!proposals.every(p=>uuid(p.id)&&(uuid(p.orderRequestId)||p.orderRequestId===null&&uuid(p.reservationId))&&Number.isSafeInteger(p.version)&&Number.isFinite(p.priceDifference)))throw new Error("No pudimos validar las propuestas.");
   if(!Array.isArray(requests)||!requests.every(r=>uuid(r.requestId)))throw new Error("No pudimos validar los pedidos.");
   setSubstitutions(proposals);setOrders(requests.filter(r=>r.status==="ACCEPTED"));
 }catch(e){setError(e instanceof Error?e.message:"No pudimos actualizar los datos.");}},[request,session]);
 useEffect(()=>{void Promise.resolve().then(refresh);},[refresh]);
 async function decide(p:Substitution,accept:boolean){if(!session||lock.current)return;lock.current=true;setBusy(true);setError("");try{
   const storage=pendingKey(session.email,p.id);const raw=Platform.OS==="web"?null:await SecureStore.getItemAsync(storage);
   const saved=raw?JSON.parse(raw) as {key:string;body:string}:null;
   const pending=saved??{key:randomUUID(),body:JSON.stringify({accept,expectedVersion:p.version})};
   if(!uuid(pending.key)||typeof pending.body!=="string")throw new Error("No pudimos recuperar el intento anterior.");
   if(Platform.OS!=="web")await SecureStore.setItemAsync(storage,JSON.stringify(pending));
   await request(`/api/v1/client/${p.preorder?"preorder-substitutions":"substitutions"}/${p.id}/decision`,{method:"POST",headers:{"Idempotency-Key":pending.key},body:pending.body});
   if(Platform.OS!=="web")await SecureStore.deleteItemAsync(storage);await refresh();
 }catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:"Resultado incierto: recupera el mismo intento.");}finally{lock.current=false;setBusy(false);}}
 async function loadDocument(id:string,kind:"PREBILL"|"RECEIPT"){setError("");try{
   const result=await request<Document>(`/api/v1/client/order-requests/${id}/documents/${kind}`);
   if(typeof result.html!=="string"||result.notice!=="COMPROBANTE / PRECUENTA — NO ES DTE — NO FEL CERTIFICADO")throw new Error("No pudimos validar el documento.");setDocument(result);
 }catch(e){setError(e instanceof Error?e.message:"No pudimos cargar el documento.");}}
 async function printBrowser(id:string,kind:"PREBILL"|"RECEIPT"){
   const base=process.env.EXPO_PUBLIC_WEB_BASE_URL;if(!base){setError("La impresión móvil requiere el enlace autorizado a Web. El documento HTML y su impresión están disponibles en Web con tu sesión.");return;}
   try{const url=new URL(base);if(url.protocol!=="https:"&&!(typeof __DEV__!=="undefined"&&__DEV__&&url.protocol==="http:"))throw new Error("El enlace autorizado debe usar HTTPS.");
    await WebBrowser.openBrowserAsync(new URL(`/client/orders/${id}/documents/${kind}`,url).toString());
   }catch(e){setError(e instanceof Error?e.message:"No pudimos abrir el documento.");}
 }
 return <ScrollView><Page><Heading eyebrow="Mis pedidos">Sustituciones y documentos</Heading>
 {!session?<Notice>Inicia sesión para consultar tus pedidos.</Notice>:<><Button title="Actualizar" secondary onPress={()=>void refresh()}/>
 {error?<Notice tone="error">{error}</Notice>:null}
 {substitutions.map(p=><Card key={p.id}><Text style={ui.body}>{p.originalName??"Producto del pedido"} → {p.quantity} × {p.replacementName} · diferencia {p.currency} {p.priceDifference.toFixed(2)}</Text><Text style={ui.body}>{p.reason}</Text><Text style={ui.body}>{p.status}</Text>
 <Notice>Tu decisión no aplica automáticamente el cambio. Operativo debe revisar disponibilidad y preparación. Una diferencia pagada requiere resolución financiera real.</Notice>
 {p.financialResolution==="BLOCKED_NO_CONTRACT"?<Notice tone="error">La diferencia pagada queda pendiente; no se registrará un cargo o reembolso ficticio.</Notice>:null}
 {p.status==="PENDING_CONSENT"?<><Button title="Consentir sustitución / recuperar intento" disabled={busy} onPress={()=>void decide(p,true)}/><Button title="Rechazar sustitución / recuperar intento" secondary disabled={busy} onPress={()=>void decide(p,false)}/></>:null}
 </Card>)}
 {orders.map(o=><Card key={o.requestId}><Text style={ui.body}>Pedido {o.requestId.slice(0,8)}</Text>{(["PREBILL","RECEIPT"] as const).map(kind=><Card key={kind}><Button title={kind==="PREBILL"?"Consultar precuenta":"Consultar comprobante"} secondary onPress={()=>void loadDocument(o.requestId,kind)}/><Button title="Abrir HTML imprimible en Web" secondary onPress={()=>void printBrowser(o.requestId,kind)}/></Card>)}</Card>)}
 {document?<Card><Text style={ui.body}>{document.title}</Text><Notice>{document.notice}</Notice><Text selectable>{document.html.replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'")}</Text><Button title="Compartir contenido HTML" secondary onPress={()=>void Share.share({message:document.html,title:document.title})}/></Card>:null}
 </>}
 </Page></ScrollView>;
}
