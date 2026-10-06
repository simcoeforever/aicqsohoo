import test from 'node:test';
import assert from 'node:assert/strict';
import {Challenge,Credential} from 'mppx';
import {charge} from 'mppx/evm/server';
import {createOfflineOrder,createOfflineCheckout,normalizeOfflineCredential,PRODUCT_SALES_ENABLED,MPP_ENABLED,SDK_VERSION} from '../src/product-payment-offline.js';
const make=(id='fixture')=>createOfflineOrder({id,productVersion:'2026-10-06.1',artifactHash:'a'.repeat(64),amount:'10000'});
function credentials(o) {
 const authorization={from:'0x0000000000000000000000000000000000000001',to:o.requirements.payTo,value:'10000',validAfter:'1699999999',validBefore:'1700000300',nonce:o.nonce};
 const signature='0x'+'00'.repeat(65); // Deliberately invalid, no key or signing operation.
 const native={challenge:o.challenge,payload:{...authorization,type:'authorization',signature}};
 const x={x402Version:2,accepted:o.requirements,payload:{authorization,signature},resource:{url:'https://offline.invalid/orders/'+o.id}};
 return {native,x,mppHeader:Credential.serialize(native),x402Header:Buffer.from(JSON.stringify(x)).toString('base64')};
}
const wire=x=>({x402Header:Buffer.from(JSON.stringify(x)).toString('base64')});
test('OFF flags; pinned real SDK roundtrips MPP and advertises only Base EVM with exact x402 terms',async()=>{
 assert.equal(PRODUCT_SALES_ENABLED,false);assert.equal(MPP_ENABLED,false);assert.equal(SDK_VERSION,'0.13.1');
 const o=make(),c=credentials(o);
 assert.deepEqual(Challenge.deserialize(Challenge.serialize(o.challenge)),o.challenge);
 assert.deepEqual(normalizeOfflineCredential(o,{mppHeader:c.mppHeader}),normalizeOfflineCredential(o,{x402Header:c.x402Header}));
 // Real official SDK transport conversion, without signing, validation or any network.
 const method=charge({chainId:8453,currency:o.requirements.asset,recipient:o.requirements.payTo,authorization:{name:'USD Coin',version:'2'},decimals:6,settle:()=>assert.fail('no settlement'),x402:{routeBinding:'resource',maxTimeoutSeconds:300}});
 const r=await method.transport.respondChallenge({challenge:o.challenge,input:new Request('https://offline.invalid/orders/'+o.id)});
 assert.equal(r.status,402);
 assert.match(r.headers.get('WWW-Authenticate'),/method="evm"/);assert.doesNotMatch(r.headers.get('WWW-Authenticate'),/tempo/);
 const body=JSON.parse(Buffer.from(r.headers.get('Payment-Required'),'base64').toString());assert.deepEqual(body.accepts,[o.requirements]);
 await assert.rejects(method.validate({credential:c.native})); // Actual SDK rejects zero signature; no new signature is created.
});
test('both formats reject wrong network/value/recipient, extensions, expired and altered challenges',()=>{
 const o=make(),c=credentials(o);
 for(const key of ['network','amount','payTo','asset']){const x=structuredClone(c.x);x.accepted[key]='wrong';assert.throws(()=>normalizeOfflineCredential(o,wire(x)));}
 for(const key of ['to','value','nonce']){const x=structuredClone(c.x);x.payload.authorization[key]=key==='value'?'20000':'0x'+'12'.repeat(key==='to'?20:32);assert.throws(()=>normalizeOfflineCredential(o,wire(x)));const n=structuredClone(c.native);n.payload[key]=x.payload.authorization[key];assert.throws(()=>normalizeOfflineCredential(o,{mppHeader:Credential.serialize(n)}));}
 const x=structuredClone(c.x);x.extensions={unsupported:{}};assert.throws(()=>normalizeOfflineCredential(o,wire(x)));
 for(const edit of [n=>n.challenge.request.methodDetails.chainId=1,n=>n.challenge.request.amount='20000',n=>n.challenge.method='tempo',n=>n.challenge.request.methodDetails.splits=[]]){const n=structuredClone(c.native);edit(n);assert.throws(()=>normalizeOfflineCredential(o,{mppHeader:Credential.serialize(n)}));}
 assert.throws(()=>normalizeOfflineCredential(o,{mppHeader:c.mppHeader,x402Header:c.x402Header}));assert.throws(()=>normalizeOfflineCredential(o,{mppHeader:c.mppHeader},1700000301));
});
test('concurrent cross-format replay shares one mocked settlement; retrieval retry never charges',async()=>{
 const o=make(),c=credentials(o);let verify=0,settle=0;
 const checkout=createOfflineCheckout({facilitator:{async verify(){verify++;return {isValid:true};},async settle(){settle++;return {success:true,network:'eip155:8453',transaction:'0x'+'b'.repeat(64)};}}});
 await Promise.all(Array.from({length:10},(_,i)=>checkout.submit(o,i%2?{mppHeader:c.mppHeader}:{x402Header:c.x402Header})));
 assert.equal(verify,1);assert.equal(settle,1);
 for(let i=0;i<3;i++)assert.equal(checkout.retrieve(o,o.productVersion,o.artifactHash).state,'settled');
 assert.equal(settle,1);assert.throws(()=>checkout.retrieve({...o,productVersion:'other'},'other',o.artifactHash));await assert.rejects(checkout.submit({...o,artifactHash:'d'.repeat(64)},{mppHeader:c.mppHeader}));assert.throws(()=>checkout.retrieve(o,'other',o.artifactHash));assert.throws(()=>checkout.retrieve(o,o.productVersion,'c'.repeat(64)));
 const other=make('other');await assert.rejects(checkout.submit(other,{x402Header:c.x402Header}));assert.equal(settle,1);
});
test('invalid verify and uncertain settle never grant retrieval or retry payment',async()=>{
 for(const mode of ['reject','throw','wrongnetwork']){
  const o=make(mode),c=credentials(o);let calls=0;
  const checkout=createOfflineCheckout({facilitator:{async verify(){return {isValid:mode!=='reject'};},async settle(){calls++;if(mode==='throw')throw Error('uncertain');return {success:true,network:'eip155:1',transaction:'0x'+'b'.repeat(64)};}}});
  const r=await checkout.submit(o,{mppHeader:c.mppHeader});assert.notEqual(r.state,'settled');assert.equal(r.retryPayment,false);
  await checkout.submit(o,{x402Header:c.x402Header});assert.equal(calls,mode==='reject'?0:1);assert.throws(()=>checkout.retrieve(o,o.productVersion,o.artifactHash));
 }
});
