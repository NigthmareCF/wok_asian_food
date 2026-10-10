import {expect,it} from "vitest";
import {isSubstitution} from "./contract";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const receipt={id,orderRequestId:null,reservationId:id,preorder:true,replacementName:"Plato (Salsa: Dulce)",quantity:1,replacementUnitPrice:22,priceDifference:2,currency:"GTQ",status:"PENDING_CONSENT",financialResolution:"NOT_REQUIRED",manualReview:false,version:1,expiresAt:"2026-12-01T12:00:00Z",reason:"Producto agotado"};
it("acepta el origen reserva sin fingir que ya existe un pedido",()=>{expect(isSubstitution(receipt)).toBe(true);});
it("rechaza una propuesta sin pedido ni reserva identificable",()=>{expect(isSubstitution({...receipt,reservationId:null})).toBe(false);});
