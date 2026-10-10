// Opt-in runner invoked by MobileCoreBoundaryIntegrationTest; no native device claim.
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const jiti=require("jiti")(__filename);
const {createApiRequest,ApiError}=jiti("../src/lib/api-client.ts");
const [origin,token,other,slot]=process.argv.slice(2);
async function main(){
  const request=createApiRequest(origin,true);
  const client=(path,options)=>request(path,options,token);
  const policy=await client("/api/v1/client/reservations/policy");
  assert.equal(policy.minimumNoticeMinutes,120);assert.equal(policy.additionalNoticeMinutes,15);assert.equal(policy.preorderItemsSupported,true);
  const service=await request("/api/v1/public/service-policy");assert.equal(service.holdMinutes,12);
  const raw={guests:2,requestedAt:slot,preorder:false,items:[]};
  const quote=await client("/api/v1/client/reservation-quotes",{method:"POST",headers:{"Idempotency-Key":randomUUID()},body:JSON.stringify(raw)});
  assert.equal(quote.status,"ACTIVE");
  await assert.rejects(()=>request(`/api/v1/client/reservation-quotes/${quote.quoteId}`,{},other),error=>error instanceof ApiError&&error.status===404);
  const body=JSON.stringify({...raw,quoteId:quote.quoteId}), key=randomUUID();
  const receipt=await client("/api/v1/client/reservations",{method:"POST",headers:{"Idempotency-Key":key},body});
  assert.equal(receipt.submitted,true);assert.ok(receipt.reservationId);
  const replay=await client("/api/v1/client/reservations",{method:"POST",headers:{"Idempotency-Key":key},body});
  assert.equal(replay.reservationId,receipt.reservationId);
  const consumed=await client(`/api/v1/client/reservation-quotes/${quote.quoteId}`);assert.equal(consumed.status,"CONSUMED");
  const frontier={...raw,requestedAt:slot.replace("T00:00:00Z","T03:15:00Z")};
  // The civil frontier is 21:15 Guatemala, i.e. 03:15 on the next UTC day.
  const arrival=new Date(slot);arrival.setUTCHours(3,15,0,0);frontier.requestedAt=arrival.toISOString();
  await assert.rejects(()=>client("/api/v1/client/reservation-quotes",{method:"POST",headers:{"Idempotency-Key":randomUUID()},body:JSON.stringify(frontier)}),error=>error instanceof ApiError&&error.status===422);
  await assert.rejects(()=>client("/api/v1/client/phone-verification",{method:"POST",body:JSON.stringify({phone:"+50255550101"})}),error=>error instanceof ApiError&&error.status===503);
  const phone=await client("/api/v1/client/phone-verification");assert.equal(phone.verified,false);
  await assert.rejects(()=>client("/api/v1/operational/orders"),error=>error instanceof ApiError&&error.status===404);
  await assert.rejects(()=>request("/api/v1/client/substitutions"),error=>error instanceof ApiError&&error.status===401);
  await assert.rejects(()=>client("/api/v1/client/order-quotes",{method:"POST",body:"{}"}),error=>error instanceof ApiError&&error.status===400);
  await assert.rejects(()=>createApiRequest(origin,false)("/api/v1/public/menu"),ApiError);
  console.log(JSON.stringify({verified:"real mobile transport/BFF/API/PostgreSQL",reservationId:receipt.reservationId,quoteId:quote.quoteId,replay:true,ownership:true,frontier:true,phoneFailsClosed:true,noNativeDevice:true}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
