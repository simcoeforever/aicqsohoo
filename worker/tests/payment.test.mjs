import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ExactEvmScheme} from '@x402/evm/exact/server';
import {x402ResourceServer} from '@x402/core/server';
import {encodePaymentSignatureHeader,decodePaymentRequiredHeader} from '@x402/core/http';
import {handle,Ledger,requirements,information,NETWORK,ASSET,AMOUNT,RECEIVING_ADDRESS,DEFAULT_CONFIG} from '../src/payment-core.js';
import {isAddress,getAddress} from 'viem';
// Fabricated addresses/signatures are ONLY local fixtures; no wallet exists or is connected.
const recipient='0x'+'1'.repeat(40), transaction='0x'+'a'.repeat(64);
const config={mode:'testnet',recipient};
const id='pay_'+'b'.repeat(32);
// Durable Object sql.exec executes immediately. Match that behavior in this SQLite mock.
function ledger(){const db=new DatabaseSync(':memory:');const s={sql:{exec(sql,...args){const stmt=db.prepare(sql);const rows=stmt.all(...args);return {toArray:()=>rows};}},transactionSync(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};return new Ledger(s);}
const consent=(identifier=id)=>({id:identifier,terms_version:'test-contribution-v1',consent:true,owner_authorized:true});
function request({body=consent(),signature,path='/contribution/test',method='POST'}={}) {return new Request('https://local.invalid'+path,{method,headers:{'Content-Type':'application/json',...(signature?{'PAYMENT-SIGNATURE':signature}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})});}
const payload=(identifier=id,accepted=requirements(recipient))=>({x402Version:2,accepted,payload:{signature:'0x'+'b'.repeat(130),authorization:{from:'0x'+'3'.repeat(40),to:recipient,value:'10000',validAfter:'0',validBefore:String(Math.floor(Date.now()/1000)+180),nonce:'0x'+'4'.repeat(64)}},extensions:{'payment-identifier':{info:{required:true,id:identifier}}}});
const signature=(identifier=id,accepted)=>encodePaymentSignatureHeader(payload(identifier,accepted));
test('user receiving address retains valid EIP55 checksum and off configuration',()=>{
  assert.equal(RECEIVING_ADDRESS,'0xF89FfB82f5F3dF83f68062a1b0d3BAA6A1005735');
  assert.ok(isAddress(RECEIVING_ADDRESS,{strict:true}));assert.equal(getAddress(RECEIVING_ADDRESS),RECEIVING_ADDRESS);
  assert.equal(DEFAULT_CONFIG.mode,'off');assert.equal(information().recipient,RECEIVING_ADDRESS);
  assert.equal(requirements(RECEIVING_ADDRESS).network,'eip155:84532');
  assert.throws(()=>requirements(RECEIVING_ADDRESS.replace('F89Ff','F89FF')));
});
const mock=(options={})=>({mock:true,verify:async()=>({isValid:true}),settle:async()=>({success:true,network:NETWORK,transaction}),...options});
test('default/off/testnet and nonmock facilitator never challenge or call anything',async()=>{
  let calls=0;const facilitator=mock({verify:async()=>{calls++;}});
  for(const mode of [undefined,'off','mainnet']){const r=await handle(request(),{config:mode?{mode,recipient}:undefined,ledger:ledger(),facilitator});assert.equal(r.status,503);assert.equal(r.headers.has('PAYMENT-REQUIRED'),false);}
  assert.equal(calls,0);
  assert.equal((await handle(request(),{config,ledger:ledger()})).status,503);
  assert.equal((await handle(request({method:'GET',path:'/contribution/info'}))).status,200);
});
test('actual pinned SDK resolves the exact test asset and v2 headers, no network call',async()=>{
  assert.equal(typeof x402ResourceServer,'function');
  const asset=await new ExactEvmScheme().parsePrice('$0.01',NETWORK);
  assert.equal(asset.asset,ASSET);assert.equal(asset.amount,AMOUNT);
  const r=await handle(request(),{config,ledger:ledger(),facilitator:mock()});assert.equal(r.status,402);
  const decoded=decodePaymentRequiredHeader(r.headers.get('PAYMENT-REQUIRED'));
  assert.equal(decoded.x402Version,2);assert.deepEqual(decoded.accepts,[requirements(recipient)]);
  assert.equal(decoded.extensions['payment-identifier'].info.required,true);
  for(const language of ['en','ja'])for(const key of ['purpose','value','fees','refunds','privacy','authority'])assert.ok(information().disclosures[language][key]);
});
test('consent, absent address, body/header bounds and free GETs cannot charge',async()=>{
  const opts={config,ledger:ledger(),facilitator:mock()};
  for(const body of [null,[],{}, {...consent(),owner_authorized:false},{...consent(),consent:false},{...consent(),extra:'IP'}])assert.equal((await handle(request({body}),opts)).status,400);
  assert.equal((await handle(request({body:{data:'x'.repeat(3000)}}),opts)).status,413);
  assert.equal((await handle(request(),{...opts,config:{mode:'testnet'}})).status,503);
  assert.equal((await handle(request({method:'GET',path:'/'}),opts)).status,404);
  assert.equal((await handle(request({signature:'a'.repeat(17000)}),opts)).status,413);
});
test('concurrent repeated logical payment settles once; same receipt survives new ledger instance',async()=>{
  const s=ledger();let verify=0,settle=0;const facilitator=mock({verify:async()=>{verify++;await new Promise(r=>setTimeout(r,10));return {isValid:true};},settle:async()=>{settle++;return {success:true,network:NETWORK,transaction};}});
  const opts={config,ledger:s,facilitator};
  const results=await Promise.all(Array.from({length:10},()=>handle(request({signature:signature()}),opts)));
  assert.equal(verify,1);assert.equal(settle,1);assert.ok(results.every(r=>[200,202].includes(r.status)));
  const restarted=new Ledger(s.storage);
  assert.equal((await handle(request({signature:signature()}),{...opts,ledger:restarted})).status,200);
  assert.equal(settle,1);
  const receipt=await handle(request({method:'GET',path:'/contribution/receipt/'+id}),{...opts,ledger:restarted});assert.equal((await receipt.json()).transaction,transaction);
  assert.equal((await handle(request({method:'GET',path:'/contribution/receipt/'+id}),{config:{mode:'off'},ledger:restarted})).status,200);
  assert.equal(JSON.stringify(restarted.row(id)).includes('LOCAL_MOCK_ONLY'),false);
});
test('changed terms/id/mainnet/amount rejected; no arbitrary client destination',async()=>{
  const opts={config,ledger:ledger(),facilitator:mock()};await handle(request(),opts);
  assert.equal((await handle(request(),{...opts,config:{mode:'testnet',recipient:'0x'+'2'.repeat(40)}})).status,409);
  for(const accepted of [{...requirements(recipient),network:'eip155:8453'},{...requirements(recipient),amount:'1000000'},{...requirements(recipient),payTo:'0x'+'2'.repeat(40)}])assert.equal((await handle(request({signature:signature(id,accepted)}),opts)).status,409);
  assert.equal((await handle(request({signature:signature('pay_'+'c'.repeat(32))}),opts)).status,409);
});
test('unknown settlement, verification exception and restart remain pending without another charge',async()=>{
  for(const facilitator of [mock({settle:async()=>{throw Error('SECRET_PAYMENT_PAYLOAD');}}),mock({settle:async()=>({success:false})}),mock({verify:async()=>{throw Error('SECRET');}})]){
    const opts={config,ledger:ledger(),facilitator};const r=await handle(request({signature:signature()}),opts);assert.equal(r.status,202);assert.equal((await r.json()).retry_payment,false);
    opts.facilitator=mock({verify:async()=>{throw Error('MUST_NOT_RETRY');}});assert.equal((await handle(request({signature:signature()}),opts)).status,202);
  }
  const s=ledger();s.create(id,JSON.stringify({terms_version:'test-contribution-v1',...requirements(recipient)}),'2026-10-04');s.claim(id);
  assert.equal((await handle(request({signature:signature()}),{config,ledger:new Ledger(s.storage),facilitator:mock()})).status,202);
});
test('explicit invalid verification is failed and daily/total caps are atomic',async()=>{
  const s=ledger();const opts={config,ledger:s,facilitator:mock({verify:async()=>({isValid:false})}),now:()=>new Date('2026-10-04T00:00:00Z')};
  assert.equal((await handle(request({signature:signature()}),opts)).status,422);
  assert.equal((await handle(request({signature:signature()}),opts)).status,422);
  for(let n=0;n<4;n++)assert.equal((await handle(request({body:consent('pay_'+String(n).padStart(32,'0'))}),opts)).status,402);
  assert.equal((await handle(request({body:consent('pay_'+'f'.repeat(32))}),opts)).status,429);
  for(let day=5;day<=7;day++)for(let n=0;n<5;n++)assert.equal(s.create('pay_'+String(day*10+n).padStart(32,'0'),'terms','2026-10-0'+day).row.state,'created');
  assert.equal(s.create('pay_'+'e'.repeat(32),'terms','2026-10-08').error,429);
});
