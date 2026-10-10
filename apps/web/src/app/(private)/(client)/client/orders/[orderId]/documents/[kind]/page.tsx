import {DocumentView} from "@/modules/consolidated-core/document-view";
import {requireContext} from "@/modules/auth/server/auth-session";
import {isUuid} from "@/modules/checkout/pickup-contract";
import {notFound} from "next/navigation";
export default async function Page({params}:{params:Promise<{orderId:string;kind:string}>}){
 const user=await requireContext("client");const {orderId,kind}=await params;
 if(!isUuid(orderId)||!["PREBILL","RECEIPT"].includes(kind))notFound();
 return <DocumentView userId={user.userId} path={`client/order-requests/${orderId}/documents/${kind}`}/>;
}
