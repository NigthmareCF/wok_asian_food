import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {QuotePanel} from "./quote-panel";
import {installPrivateSession,staffFixtureId} from "@/test/private-session-fixture";
import {clientIdentityStore} from "@/modules/clients/client-identity-store";
vi.mock("./modifier-choices",()=>({ModifierChoices:()=>null}));
const item="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",quoteId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
afterEach(()=>{cleanup();clientIdentityStore.invalidate();vi.unstubAllGlobals();});
it("cotizar no acepta ni crea una solicitud; el cliente decide explícitamente y cambiar horario invalida la selección",async()=>{
 const transport=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{void input;void init;return Response.json({quoteId,status:"ACTIVE",expiresAt:new Date(Date.now()+720000).toISOString(),message:"Sólo cotización",subtotal:20,currency:"GTQ"});});installPrivateSession(transport);
 const select=vi.fn();const props={userId:staffFixtureId,items:[{menuItemId:item,quantity:1}],requestedFor:"2026-12-01T00:00:00Z",fulfillment:"PICKUP" as const,onSelection:select};
 const view=render(<QuotePanel {...props}/>);await waitFor(()=>expect(screen.getByRole("button",{name:"Cotizar con el servidor"})).toBeEnabled());
 fireEvent.click(screen.getByRole("button",{name:"Cotizar con el servidor"}));await screen.findByText("Sólo cotización");
 expect(select).not.toHaveBeenCalledWith(expect.objectContaining({quoteId}));expect(transport).toHaveBeenCalledTimes(1);
 expect(String(transport.mock.calls[0]?.[0])).toContain("/order-quotes");
 fireEvent.click(screen.getByRole("checkbox"));expect(select).toHaveBeenLastCalledWith({quoteId,items:[{menuItemId:item,quantity:1,modifierIds:[]}]});
 view.rerender(<QuotePanel {...props} requestedFor="2026-12-02T00:00:00Z"/>);await waitFor(()=>expect(select).toHaveBeenLastCalledWith(null));expect(screen.queryByRole("checkbox")).toBeNull();
});
it("una respuesta perdida conserva la clave de quote y rechaza cotizaciones vencidas",async()=>{
 let posts=0;const transport=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{void input;void init;if(++posts===1)throw new TypeError("lost");return Response.json({quoteId,status:"EXPIRED",expiresAt:"2020-01-01T00:00:00Z",message:"Venció"});});installPrivateSession(transport);
 render(<QuotePanel userId={staffFixtureId} items={[{menuItemId:item,quantity:1}]} requestedFor="2026-12-01T00:00:00Z" fulfillment="PICKUP" onSelection={()=>{}}/>);
 await waitFor(()=>expect(screen.getByRole("button",{name:"Cotizar con el servidor"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"Cotizar con el servidor"}));await screen.findByRole("alert");
 fireEvent.click(screen.getByRole("button",{name:"Cotizar con el servidor"}));await screen.findByText("La cotización venció. Cotiza otra vez.");
 expect((transport.mock.calls[0]?.[1] as RequestInit).headers).toEqual((transport.mock.calls[1]?.[1] as RequestInit).headers);expect(screen.queryByRole("checkbox")).toBeNull();
});
