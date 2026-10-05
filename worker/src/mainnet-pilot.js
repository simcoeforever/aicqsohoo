// Owner-only, single-start real-USDC pilot. Never stores signed payloads or payer data.
import {verifyTypedData} from 'viem';
import {encodePaymentRequiredHeader,decodePaymentSignatureHeader} from '@x402/core/http';
import {declarePaymentIdentifierExtension,extractPaymentIdentifier} from '@x402/extensions/payment-identifier';
import {createCdpFacilitatorClient} from '@coinbase/cdp-sdk/x402';
import {RECEIVING_ADDRESS} from './payment-core.js';
export const PILOT_NETWORK='eip155:8453',PILOT_ASSET='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const PILOT_VERSION='mainnet-pilot-v1';
export const AUTHORIZATION_TYPES={TransferWithAuthorization:[{name:'from',type:'address'},{name:'to',type:'address'},
  {name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}]};
const response=(status,body,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
export const pilotTerms=()=>({scheme:'exact',network:PILOT_NETWORK,asset:PILOT_ASSET,amount:'10000',
  payTo:RECEIVING_ADDRESS,maxTimeoutSeconds:300,extra:{name:'USDC',version:'2'}});
export function pilotReceipt(row){
  if(row.state==='settled')return response(200,{id:row.id,state:'settled',network:PILOT_NETWORK,transaction:row.transaction_hash,self_transfer:true,no_goods_or_access:true});
  return response(row.state==='failed'?422:202,{id:row.id,state:row.state==='failed'?'failed':'pending',retry_payment:false});
}
export function cdpPilotClient(env){
  return createCdpFacilitatorClient({apiKeyId:env.CDP_API_KEY_ID,apiKeySecret:env.CDP_API_KEY_SECRET});
}
async function bodyJson(request){
  let size=0;const chunks=[];const reader=request.body?.getReader();if(!reader)throw Error('body');
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();throw Error('size');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function verifyOwnerAuthorization(payload,nowSeconds){
  const a=payload?.payload?.authorization;
  if(!a||typeof a.from!=='string'||typeof a.to!=='string'||Object.keys(a).length!==6||Object.keys(a).some(k=>!['from','to','value','validAfter','validBefore','nonce'].includes(k))||
    a.from?.toLowerCase()!==RECEIVING_ADDRESS.toLowerCase()||a.to?.toLowerCase()!==RECEIVING_ADDRESS.toLowerCase()||
    String(a.value)!=='10000'||!/^\d{1,12}$/.test(String(a.validAfter))||!/^\d{1,12}$/.test(String(a.validBefore))||
    Number(a.validAfter)>nowSeconds||Number(a.validBefore)<=nowSeconds||Number(a.validBefore)>nowSeconds+300||
    !/^0x[0-9a-fA-F]{64}$/.test(a.nonce||'')||!/^0x[0-9a-fA-F]{130}$/.test(payload.payload?.signature||''))return false;
  try{return await verifyTypedData({address:RECEIVING_ADDRESS,domain:{name:'USDC',version:'2',chainId:8453,verifyingContract:PILOT_ASSET},
    types:AUTHORIZATION_TYPES,primaryType:'TransferWithAuthorization',message:{...a,value:BigInt(a.value),validAfter:BigInt(a.validAfter),validBefore:BigInt(a.validBefore)},signature:payload.payload.signature});}
  catch(_){return false;}
}
export async function handlePilot(request,{mode='off',ledger,client,now=()=>new Date(),verifyOwner=verifyOwnerAuthorization}={}){
  const path=new URL(request.url).pathname;
  if(request.method==='GET'&&/^\/contribution\/mainnet\/receipt\/main_[a-zA-Z0-9_-]{16,59}$/.test(path)){
    const row=ledger?.row(path.split('/').pop());return row?pilotReceipt(row):response(404,{error:'unknown_receipt'});
  }
  if(mode!=='owner-pilot')return response(503,{enabled:false,error:'mainnet_not_activated',retry_payment:false});
  if(request.method!=='POST'||path!=='/contribution/mainnet/self-test')return response(503,{enabled:false,error:'owner_pilot_only',retry_payment:false});
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return response(400,{error:'json_required'});
  let body;try{body=await bodyJson(request);}catch(_){return response(400,{error:'invalid_request'});}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['id','terms_version','consent','owner_authorized'].includes(k))||
    !/^main_[a-zA-Z0-9_-]{16,59}$/.test(body.id||'')||body.terms_version!==PILOT_VERSION||body.consent!==true||body.owner_authorized!==true)
    return response(400,{error:'explicit_owner_consent_required'});
  const old=ledger.row(body.id);if(old)return pilotReceipt(old);
  const count=ledger.storage.sql.exec('SELECT COUNT(*) AS n FROM contributions').toArray()[0].n;
  if(count>=1)return response(429,{error:'single_owner_attempt_consumed',retry_payment:false});
  const terms=pilotTerms(),signature=request.headers.get('PAYMENT-SIGNATURE');
  if(!signature){
    // Unsigned requests cannot consume the owner's one slot or call CDP.
    const challenge={x402Version:2,resource:{url:'https://aicqsohoo.com/contribution/mainnet/self-test',
      description:'Owner-only 0.01 real USDC self-transfer pilot; no goods or access.',mimeType:'application/json'},accepts:[terms],
      extensions:{'payment-identifier':declarePaymentIdentifierExtension(true)}};
    return response(402,{id:body.id,...challenge},{'PAYMENT-REQUIRED':encodePaymentRequiredHeader(challenge)});
  }
  if(signature.length>16384)return response(413,{error:'payment_header_too_large'});
  let payload;try{payload=decodePaymentSignatureHeader(signature);}catch(_){return response(400,{error:'invalid_payment_payload'});}
  const accepted=payload?.accepted;
  if(payload?.x402Version!==2||!accepted||Object.keys(accepted).some(k=>!(k in terms))||
    Object.keys(terms).some(k=>k!=='extra'&&accepted[k]!==terms[k])||accepted.extra?.name!=='USDC'||accepted.extra?.version!=='2'||
    Object.keys(accepted.extra).length!==2||extractPaymentIdentifier(payload)!==body.id)return response(409,{error:'fixed_payment_terms_or_id_mismatch'});
  // Cryptographic ownership check BEFORE any quota reservation/provider call.
  if(!(await verifyOwner(payload,Math.floor(now().getTime()/1000))))return response(403,{error:'owner_self_transfer_signature_required'});
  const canonical=JSON.stringify({terms_version:PILOT_VERSION,...terms});
  const record=ledger.create(body.id,canonical,now().toISOString().slice(0,10));
  if(record.error)return response(record.error,{error:'single_owner_attempt_consumed',retry_payment:false});
  if(!ledger.claim(body.id))return pilotReceipt(ledger.row(body.id));
  // All exceptions/restarts from this point consume the sole start and stop.
  try{
    const facilitator=typeof client==='function'?client():client;
    const verified=await facilitator.verify(payload,terms);
    if(verified.isValid!==true){ledger.state(body.id,'failed');return pilotReceipt(ledger.row(body.id));}
    ledger.state(body.id,'settling');
    const result=await facilitator.settle(payload,terms);
    if(result.success===true&&result.network===PILOT_NETWORK&&/^0x[a-fA-F0-9]{64}$/.test(result.transaction||''))ledger.state(body.id,'settled',result.transaction);
    else ledger.state(body.id,'pending');
  }catch(_){ledger.state(body.id,'pending');}
  return pilotReceipt(ledger.row(body.id));
}
