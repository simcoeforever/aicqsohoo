// Testnet-only payment core. Never stores signatures, payer addresses or access identifiers.
import { encodePaymentRequiredHeader, decodePaymentSignatureHeader } from '@x402/core/http';
import { declarePaymentIdentifierExtension, extractPaymentIdentifier, isValidPaymentId } from '@x402/extensions/payment-identifier';
import { isAddress } from 'viem';
export const RECEIVING_ADDRESS='0xF89FfB82f5F3dF83f68062a1b0d3BAA6A1005735';
export const DEFAULT_CONFIG = Object.freeze({mode:'off',recipient:RECEIVING_ADDRESS});
export const NETWORK='eip155:84532';
export const ASSET='0x036CbD53842c5426634e7929541eC2318f3dCF7e';
export const AMOUNT='10000'; // 0.01 test USDC, six decimals
export const FACILITATOR='https://x402.org/facilitator';
const VERSION='test-contribution-v1';
const reply=(status,body,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
export function information(config=DEFAULT_CONFIG) {
  return {enabled:config.mode==='testnet',payment_mode:config.mode,terms_version:VERSION,network:NETWORK,
    asset:ASSET,amount_atomic:AMOUNT,amount_display:'0.01 test USDC',recipient:config.recipient,
    facilitator:FACILITATOR,existing_content_free:true,requires_owner_authorization:true,
    disclosures:{
      en:{purpose:'Voluntary test contribution only. No goods, service, access rights or investment return are provided.',value:'Test tokens are not real USDC and are intended to have no financial value.',fees:'No facilitator fee is planned for this public testnet experiment. Test-chain gas may apply; check your wallet before signing. No mainnet payment is supported.',refunds:'No refunds are offered for voluntary test-token contributions. This does not waive any rights required by applicable law.',privacy:'Blockchain transfers and receiving addresses are public. A receipt identifier and settlement result are stored separately from access analytics; payment payloads, payer addresses, IP addresses and visitor identifiers are not logged.',authority:'An agent must have explicit wallet-owner authorization. Visiting this page does not authorize a payment.'},
      ja:{purpose:'テスト用トークンによる任意の支援です。商品、サービス、閲覧権、投資利益は提供しません。',value:'テスト用トークンは本物のUSDCではなく、金銭的価値を持たないことを想定しています。',fees:'この公開テストネット実験では仲介サービスの料金を予定していません。テストチェーンのガスが必要な場合があります。署名前にウォレットで確認してください。本番ネットの支払いには対応しません。',refunds:'任意のテスト用トークンの支援は返金しません。適用される法律上必要な権利を放棄させるものではありません。',privacy:'チェーン上の送金と受取アドレスは公開されます。受領IDと決済結果をアクセス解析とは分離して保存します。支払いの生データ、支払者アドレス、IP、訪問者識別子はログに残しません。',authority:'AIにはウォレット所有者の明示的な許可が必要です。閲覧しただけでは送金を許可したことになりません。'}
    }};
}
export function requirements(recipient) {
  if (!isAddress(recipient||'',{strict:true}) || /^0x0{40}$/i.test(recipient)) throw Error('recipient_not_configured');
  return {scheme:'exact',network:NETWORK,asset:ASSET,amount:AMOUNT,payTo:recipient,maxTimeoutSeconds:300,extra:{name:'USDC',version:'2'}};
}

// SQLite DO-compatible storage adapter: each claim is synchronous and atomic.
// Persist state BEFORE verify/settle. A restart at either point is pending, never retried.
export class Ledger {
  constructor(storage,{daily=5,total=20}={}) {
    if(!Number.isInteger(daily)||!Number.isInteger(total)||daily<1||total<1)throw Error('invalid_caps');
    this.dailyCap=daily;this.totalCap=total;
    this.storage=storage;
    storage.sql.exec('CREATE TABLE IF NOT EXISTS contributions (id TEXT PRIMARY KEY, terms TEXT NOT NULL, day TEXT NOT NULL, state TEXT NOT NULL, transaction_hash TEXT)');
  }
  row(id) {return this.storage.sql.exec('SELECT * FROM contributions WHERE id=?',id).toArray()[0];}
  create(id,terms,day) {
    return this.storage.transactionSync(()=>{
      const old=this.row(id);
      if(old)return old.terms===terms?{row:old}:{error:409};
      const daily=this.storage.sql.exec('SELECT COUNT(*) AS n FROM contributions WHERE day=?',day).toArray()[0].n;
      const total=this.storage.sql.exec('SELECT COUNT(*) AS n FROM contributions').toArray()[0].n;
      if(daily>=this.dailyCap||total>=this.totalCap)return {error:429};
      this.storage.sql.exec('INSERT INTO contributions (id,terms,day,state) VALUES (?,?,?,?)',id,terms,day,'created');
      return {row:this.row(id)};
    });
  }
  claim(id) {
    return this.storage.transactionSync(()=>{
      const row=this.row(id);
      if(row?.state!=='created')return false;
      this.storage.sql.exec("UPDATE contributions SET state='verifying' WHERE id=?",id);return true;
    });
  }
  state(id,state,hash=null) {this.storage.sql.exec('UPDATE contributions SET state=?, transaction_hash=? WHERE id=?',state,hash,id);}
}
async function boundedJson(request) {
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw Error('invalid');
  let size=0;const chunks=[];const reader=request.body?.getReader();if(!reader)throw Error('invalid');
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();throw Error('large');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function receipt(row) {
  if(row.state==='settled')return reply(200,{id:row.id,state:'settled',network:NETWORK,transaction:row.transaction_hash,no_goods_or_access:true});
  if(['verifying','settling','pending'].includes(row.state))return reply(202,{id:row.id,state:'pending',retry_payment:false});
  if(row.state==='failed')return reply(422,{id:row.id,state:'failed',retry_payment:false});
  return reply(200,{id:row.id,state:'created'});
}
export async function handle(request,{config=DEFAULT_CONFIG,ledger,facilitator,now=()=>new Date()}={}) {
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/contribution/info')return reply(200,information(config));
  if(ledger&&request.method==='GET'&&/^\/contribution\/receipt\/[a-zA-Z0-9_-]{16,64}$/.test(url.pathname)){
    const row=ledger.row(url.pathname.split('/').pop());return row?receipt(row):reply(404,{error:'unknown_receipt'});
  }
  // Off/mainnet/unknown modes cannot process payments.
  if(config.mode!=='testnet'||!facilitator||!ledger)return reply(503,{enabled:false,error:'payments_disabled'});
  if(request.method!=='POST'||url.pathname!=='/contribution/test')return reply(404,{error:'not_found'});
  let body;try{body=await boundedJson(request);}catch(e){return reply(e.message==='large'?413:400,{error:'invalid_request'});}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['id','terms_version','consent','owner_authorized'].includes(key))||
     !isValidPaymentId(body.id)||! /^[a-zA-Z0-9_-]{16,64}$/.test(body.id||'')||body.terms_version!==VERSION||body.consent!==true||body.owner_authorized!==true)return reply(400,{error:'explicit_authorized_consent_required'});
  let terms;try{terms=requirements(config.recipient);}catch(_){return reply(503,{error:'recipient_not_configured'});}
  const canonical=JSON.stringify({terms_version:VERSION,...terms});
  const probe=url.searchParams.get('measurement')==='test';
  const record=probe?{row:{id:body.id,state:'created'}}:ledger.create(body.id,canonical,now().toISOString().slice(0,10));
  if(record.error)return reply(record.error,{error:record.error===409?'terms_conflict':'experiment_cap_reached'});
  if(record.row.state!=='created')return receipt(record.row);
  const signature=request.headers.get('PAYMENT-SIGNATURE');
  if(!signature){
    const challenge={x402Version:2,resource:{url:'https://aicqsohoo.com/contribution/test',description:'Voluntary test-token contribution; all site content remains free.',mimeType:'application/json'},accepts:[terms],extensions:{'payment-identifier':declarePaymentIdentifierExtension(true)}};
    return reply(402,{id:body.id,...challenge,information:information(config)},{'PAYMENT-REQUIRED':encodePaymentRequiredHeader(challenge)});
  }
  if(probe)return reply(400,{error:'validation_test_cannot_pay'});
  if(signature.length>16384)return reply(413,{error:'payment_header_too_large'});
  let payload;try{payload=decodePaymentSignatureHeader(signature);}catch(_){return reply(400,{error:'invalid_payment_payload'});}
  const accepted=payload?.accepted;
  if(payload?.x402Version!==2||!accepted||Object.keys(accepted).some(key=>!(key in terms))||
     Object.keys(terms).some(key=>key!=='extra'&&accepted[key]!==terms[key])||
     accepted.extra?.name!=='USDC'||accepted.extra?.version!=='2'||Object.keys(accepted.extra).length!==2||
     extractPaymentIdentifier(payload)!==body.id)return reply(409,{error:'payment_terms_or_id_mismatch'});
  if(!ledger.claim(body.id))return receipt(ledger.row(body.id));
  try {
    const auth=payload.payload?.authorization;
    if(!auth||auth.to?.toLowerCase()!==terms.payTo.toLowerCase()||String(auth.value)!==AMOUNT||Number(auth.validBefore)>Math.floor(now().getTime()/1000)+300||! /^0x[0-9a-fA-F]{64}$/.test(auth.nonce||'')||! /^0x[0-9a-fA-F]{130}$/.test(payload.payload?.signature||'')){ledger.state(body.id,'failed');return receipt(ledger.row(body.id));}
    const verified=await facilitator.verify(payload,terms);
    if(verified.isValid!==true){ledger.state(body.id,'failed');return receipt(ledger.row(body.id));}
    ledger.state(body.id,'settling');
    const result=await facilitator.settle(payload,terms);
    // Ambiguous replies, missing/invalid transaction hashes and any exception remain pending.
    if(result.success===true&&result.network===NETWORK&&/^0x[a-fA-F0-9]{64}$/.test(result.transaction||''))ledger.state(body.id,'settled',result.transaction);
    else ledger.state(body.id,'pending');
  }catch(_){ledger.state(body.id,'pending');}
  return receipt(ledger.row(body.id));
}
