const assert=require("node:assert/strict");
const {test}=require("node:test");
const jiti=require("jiti")(__filename);
const {quoteSelectionMatches}=jiti("../src/lib/quote-selection.ts");
const {createCartState}=jiti("../src/lib/cart-state.ts");
const {isInternationalPhone,formatGuatemalaPhoneInput}=jiti("../src/lib/identity.ts");
const now=Date.parse("2026-10-09T18:00:00Z");
const item="bef0df01-a4cf-4ee9-a9ed-277ac338b7ee";
const modifier="e4028e1f-dcac-4d32-9f24-120ac9d38c03";
const quoteId="09b7f19c-7ea1-4b55-bb27-8b342fb73f60";

test("accepted quote is bound to owner, expiry, civil instant, service, guests and cart",()=>{
  const input={ownerEmail:"client@example.test",items:[{menuItemId:item,quantity:2}],requestedFor:"2026-10-09T20:00:00Z",fulfillment:"PICKUP"};
  const accepted={...input,quoteId,expiresAt:"2026-10-09T18:12:00Z",items:[{menuItemId:item,quantity:2,modifierIds:[modifier]}]};
  assert.equal(quoteSelectionMatches(accepted,input,now),true);
  assert.equal(quoteSelectionMatches(accepted,input,now+12*60000),false);
  for(const changed of [{ownerEmail:"other@example.test"},{requestedFor:"2026-10-09T20:01:00Z"},{fulfillment:"DELIVERY"},{items:[{menuItemId:item,quantity:1}]},{guests:5},{preorder:true}])
    assert.equal(quoteSelectionMatches(accepted,{...input,...changed},now),false);
  assert.equal(quoteSelectionMatches({...accepted,expiresAt:"invalid"},input,now),false);
});

test("uncertain pickup with quote and modifier snapshots replays unchanged after expiry",async()=>{
  const data=new Map();const storage={getItemAsync:async key=>data.get(key)??null,setItemAsync:async(key,value)=>data.set(key,value),deleteItemAsync:async key=>data.delete(key)};
  const state=createCartState(storage);await state.restore();
  const attempt={email:"client@example.test",key:quoteId,body:{quoteId,requestedFor:"2026-01-01T00:00:00Z",items:[{menuItemId:item,quantity:2,modifierIds:[modifier]}]}};
  await state.prepareAttempt(attempt);
  const restored=createCartState(storage);await restored.restore();
  assert.deepEqual(restored.getSnapshot().attempt,attempt);
  const before=restored.getSnapshot();
  restored.changeQuantity(item,1);
  assert.deepEqual(restored.getSnapshot(),before);
});

test("phone formatting keeps an explicit international number and never supplies a country code",()=>{
  assert.equal(formatGuatemalaPhoneInput("+1 (212) 555-0101"),"+12125550101");
  assert.equal(isInternationalPhone("+12125550101"),true);
  assert.equal(isInternationalPhone("1234 5678"),false);
  assert.equal(isInternationalPhone(formatGuatemalaPhoneInput("55550101")),false);
});
