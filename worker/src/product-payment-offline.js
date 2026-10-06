// OFFLINE prototype only. Not imported by the Worker router. No storage or delivery backend.
import {isDeepStrictEqual} from 'node:util';
import {Challenge,Credential} from 'mppx';
import {challengeHash,AuthorizationPayloadSchema} from 'mppx/evm';
export const PRODUCT_SALES_ENABLED=false;
export const MPP_ENABLED=false;
export const SDK_VERSION='0.13.1';
const ASSET='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const RECEIVER='0xF89FfB82f5F3dF83f68062a1b0d3BAA6A1005735';
const fail=()=>{throw new Error('unsupported_or_mismatched_payment');};
const keys=(v,allowed)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail();};
const same=(a,b)=>{if(!isDeepStrictEqual(a,b))fail();};
const hex=(a,b)=>{if(typeof a!=='string'||a.toLowerCase()!==b.toLowerCase())fail();};
// No defaults for price/merchant disclosures: caller supplies only synthetic offline terms.
export function createOfflineOrder({id,productVersion,artifactHash,amount,now=1700000000}) {
 if(!/^[a-z0-9-]{1,64}$/.test(id)||!productVersion||!/^[a-f0-9]{64}$/.test(artifactHash)||!/^\d+$/.test(amount)||BigInt(amount)<=0n)fail();
 const request={amount,currency:ASSET,recipient:RECEIVER,externalId:id,methodDetails:{chainId:8453,decimals:6,credentialTypes:['authorization']}};
 const challenge=Challenge.from({id:'offline-'+id,realm:'offline.invalid',method:'evm',intent:'charge',request,expires:new Date((now+300)*1000).toISOString()});
 return Object.freeze({id,productVersion,artifactHash,expires:now+300,challenge,nonce:challengeHash(challenge),requirements:{scheme:'exact',network:'eip155:8453',asset:ASSET,amount,payTo:RECEIVER,maxTimeoutSeconds:300,extra:{name:'USD Coin',version:'2',assetTransferMethod:'eip3009'}}});
}
// Parse actual SDK wire encodings; reject extensions rather than silently losing semantics.
export function normalizeOfflineCredential(order,{mppHeader,x402Header},now=1700000000) {
 if(Boolean(mppHeader)===Boolean(x402Header)||now>=order.expires)fail();
 let authorization,signature;
 if(mppHeader) {
  if(mppHeader.length>16384||!/^Payment [A-Za-z0-9_-]+={0,2}$/i.test(mppHeader))fail();
  const raw=JSON.parse(Buffer.from(mppHeader.slice(8),'base64url').toString('utf8'));
  keys(raw,['challenge','payload','source']);keys(raw.challenge,['id','realm','method','intent','request','expires']);
  const c=Credential.deserialize(mppHeader);
  keys(c,['challenge','payload','source']);same(c.challenge,order.challenge);
  keys(c.payload,['type','from','to','value','validAfter','validBefore','nonce','signature']);
  const p=AuthorizationPayloadSchema.parse(c.payload);
  if(p.type!=='authorization')fail();
  authorization=Object.fromEntries(['from','to','value','validAfter','validBefore','nonce'].map(k=>[k,p[k]]));signature=p.signature;
  if(c.source&&c.source!==`did:pkh:eip155:8453:${p.from}`)fail();
 } else {
  if(x402Header.length>16384||!/^[A-Za-z0-9+/]+={0,2}$/.test(x402Header))fail();
  const c=JSON.parse(Buffer.from(x402Header,'base64').toString('utf8'));
  keys(c,['x402Version','accepted','payload','resource']);if(c.x402Version!==2)fail();
  same(c.accepted,order.requirements);
  // A fixed per-order resource and nonce bind product/version via the stored order.
  same(c.resource,{url:'https://offline.invalid/orders/'+order.id});
  keys(c.payload,['authorization','signature']);
  keys(c.payload.authorization,['from','to','value','validAfter','validBefore','nonce']);
  const p=AuthorizationPayloadSchema.parse({...c.payload.authorization,type:'authorization',signature:c.payload.signature});
  authorization=Object.fromEntries(['from','to','value','validAfter','validBefore','nonce'].map(k=>[k,p[k]]));signature=p.signature;
 }
 hex(authorization.to,RECEIVER);same(authorization.value,order.requirements.amount);hex(authorization.nonce,order.nonce);
 if(BigInt(authorization.validAfter)>BigInt(now)||BigInt(authorization.validBefore)<=BigInt(now+5)||BigInt(authorization.validBefore)>BigInt(order.expires))fail();
 return {x402Version:2,accepted:order.requirements,payload:{authorization,signature}};
}
// Explicit mock harness, never a production purchase API. Client implements the existing
// HTTPFacilitatorClient verify(payload, requirements)/settle(payload, requirements) interface.
export function createOfflineCheckout({facilitator,now=()=>1700000000}) {
 const states=new Map(),usedNonces=new Set();
 const receipt=(o,s)=>({orderId:o.id,productVersion:o.productVersion,artifactHash:o.artifactHash,state:s.state,transaction:s.transaction??null,retryPayment:false});
 return {
  async submit(order,credential) {
   const payload=normalizeOfflineCredential(order,credential,now());
   if(states.has(order.id)){const saved=states.get(order.id);same(order,saved.order);return receipt(order,saved);}
   const nonce=payload.payload.authorization.nonce.toLowerCase();if(usedNonces.has(nonce))fail();
   // Synchronous claim before any await; both wire formats share the same slot.
   usedNonces.add(nonce);const state={state:'pending',order:structuredClone(order)};states.set(order.id,state);
   try {
    const verified=await facilitator.verify(payload,order.requirements);
    if(verified.isValid!==true){state.state='failed';return receipt(order,state);}
    const settled=await facilitator.settle(payload,order.requirements);
    if(settled.success===true&&settled.network==='eip155:8453'&&/^0x[a-fA-F0-9]{64}$/.test(settled.transaction)) {
     state.state='settled';state.transaction=settled.transaction;
    }
   }catch{/* Unknown response permanently stays pending in this harness. */}
   return receipt(order,state);
  },
  retrieve(order,requestedVersion,requestedHash) {
   same(requestedVersion,order.productVersion);same(requestedHash,order.artifactHash);
   const state=states.get(order.id);if(!state||state.state!=='settled')fail();same(order,state.order);
   return receipt(order,state); // Metadata only: no private artifact delivery or credentials.
  }
 };
}
