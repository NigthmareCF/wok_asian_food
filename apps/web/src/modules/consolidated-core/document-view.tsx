"use client";
import {Button} from "@/shared/components/ui/button";
import {useClientPickupResource} from "@/modules/client-order-tracking/use-client-pickup-resource";
import {isDocument,type PrintedDocument} from "./contract";
export function DocumentView({path,userId}:{path:string;userId:string}) {
 const resource=useClientPickupResource(`/bff/core/${path}`,isDocument,userId,0);
 const document=resource.data;
 return <section className="wok-print-host"><h1>{document?.title??"Documento"}</h1>
  <div className="wok-print-controls"><Button onClick={()=>window.print()} disabled={!document||!!resource.error}>Imprimir / guardar PDF</Button><Button variant="secondary" onClick={resource.reload}>Actualizar</Button></div>
  {resource.error?<p role="alert">{resource.error.message}</p>:document?<SafeDocument document={document}/>:<p role="status">Consultando documento…</p>}
  <style>{`@media print{body *{visibility:hidden}.wok-print-host,.wok-print-host *{visibility:visible}.wok-print-host{position:absolute;left:0;top:0;width:100%;background:white;color:black}.wok-print-controls{display:none}}.wok-print-document table{width:100%;border-collapse:collapse}.wok-print-document th,.wok-print-document td{padding:.5rem;border-bottom:1px solid #ccc;text-align:left}`}</style>
 </section>;
}
function SafeDocument({document}:{document:PrintedDocument}) {
 // El servidor escapa todos los campos y solo compone estas etiquetas. No aceptar HTML activo.
 const tags=document.html.match(/<[^>]*>/g)??[];
 const safe=tags.every(tag=>/^<\/?(?:article|h1|h2|h3|p|table|thead|tbody|tr|th|td|section|br)(?: class="wok-print-document")?\s*>$/.test(tag));
 return safe?<div dangerouslySetInnerHTML={{__html:document.html}}/>:<p role="alert">El documento contiene formato no permitido.</p>;
}
