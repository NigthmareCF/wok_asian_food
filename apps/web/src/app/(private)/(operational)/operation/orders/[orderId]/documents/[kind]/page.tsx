import {DocumentView} from "@/modules/consolidated-core/document-view";
import {requireContext} from "@/modules/auth/server/auth-session";
import {isUuid} from "@/modules/checkout/pickup-contract";
import {notFound} from "next/navigation";
export default async function Page({params}:{params:Promise<{orderId:string;kind:string}>}){
 const user=await requireContext("operational");const {orderId,kind}=await params;
 if(!isUuid(orderId)||!["COMMAND","PREBILL","RECEIPT"].includes(kind))notFound();
 return <DocumentView userId={user.userId} path={`operational/orders/${orderId}/documents/${kind}`}/>;
}
