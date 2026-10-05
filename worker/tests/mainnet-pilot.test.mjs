import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {encodePaymentSignatureHeader} from '@x402/core/http';
import {Ledger,RECEIVING_ADDRESS} from '../src/payment-core.js';
import {handlePilot,pilotTerms,verifyOwnerAuthorization,PILOT_NETWORK} from '../src/mainnet-pilot.js';
const now=()=>new Date('2026-10-05T01:00:00Z'),t=Math.floor(now().getTime()/1000),id='main_'+'a'.repeat(32),hash='0x'+'b'.repeat(64);
function ledger(){const db=new DatabaseSync(':memory:');return new Ledger({sql:{exec(q,...args){const rows=db.prepare(q).all(...args);return {toArray:()=>rows};}},transactionSync(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}},{daily:1,total:1});}
const body=(n=id)=>({id:n,terms_version:'mainnet-pilot-v1',consent:true,owner_authorized:true});
const payload=(n=id)=>({x402Version:2,accepted:pilotTerms(),extensions:{'payment-identifier':{info:{required:true,id:n}}},
  payload:{signature:'0x'+'c'.repeat(130),authorization:{from:RECEIVING_ADDRESS,to:RECEIVING_ADDRESS,value:'10000',validAfter:'0',validBefore:String(t+180),nonce:'0x'+'d'.repeat(64)}}});
const req=(p=null,n=id)=>new Request('https://local/contribution/mainnet/self-test',{method:'POST',headers:{'Content-Type':'application/json',...(p?{'PAYMENT-SIGNATURE':encodePaymentSignatureHeader(p)}:{})},body:JSON.stringify(body(n))});
const opts=()=>({mode:'owner-pilot',ledger:ledger(),now,verifyOwner:async()=>true,client:{verify:async()=>({isValid:true}),settle:async()=>({success:true,network:PILOT_NETWORK,transaction:hash})}});
test('unsigned challenges do not reserve quota or call CDP; off and arbitrary modes never accept',async()=>{
  const o=opts();let calls=0;o.client=()=>{calls++;throw Error('must-not-call');};
  for(let i=0;i<20;i++)assert.equal((await handlePilot(req(),o)).status,402);
  assert.equal(o.ledger.storage.sql.exec('SELECT COUNT(*) AS n FROM contributions').toArray()[0].n,0);assert.equal(calls,0);
  for(const mode of ['off','mainnet','testnet',undefined])assert.equal((await handlePilot(req(payload()),{...o,mode})).status,503);
});
test('real local crypto rejects forged owner signature, wrong payer/to/amount/expiry without consuming quota',async()=>{
  assert.equal(await verifyOwnerAuthorization(payload(),t),false);
  for(const changes of [{from:'0x'+'1'.repeat(40)},{to:'0x'+'1'.repeat(40)},{value:'10001'},{validBefore:String(t+301)},{validBefore:String(t)},{validAfter:String(t+1)},{from:42}]){
    const p=payload();Object.assign(p.payload.authorization,changes);assert.equal(await verifyOwnerAuthorization(p,t),false);
  }
  const o={...opts(),verifyOwner:verifyOwnerAuthorization};assert.equal((await handlePilot(req(payload()),o)).status,403);
  assert.equal(o.ledger.storage.sql.exec('SELECT COUNT(*) AS n FROM contributions').toArray()[0].n,0);
});
test('fixed chain, asset, amount, recipient, extension ID and bounded body/header are enforced',async()=>{
  for(const changes of [{network:'eip155:84532'},{asset:'0x'+'1'.repeat(40)},{amount:'10001'},{payTo:'0x'+'1'.repeat(40)},{scheme:'upto'},{maxTimeoutSeconds:301}]){
    const p=payload();Object.assign(p.accepted,changes);assert.equal((await handlePilot(req(p),opts())).status,409);
  }
  const p=payload('main_'+'e'.repeat(32));assert.equal((await handlePilot(req(p),opts())).status,409);
  const huge=new Request('https://local/contribution/mainnet/self-test',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(2049)});
  assert.equal((await handlePilot(huge,opts())).status,400);
});
test('ten concurrent valid fixture submissions settle exactly once; restart/another ID cannot reopen slot',async()=>{
  const o=opts();let verify=0,settle=0;o.client={verify:async()=>{verify++;await new Promise(r=>setTimeout(r,10));return {isValid:true};},settle:async()=>{settle++;return {success:true,network:PILOT_NETWORK,transaction:hash};}};
  const result=await Promise.all(Array.from({length:10},()=>handlePilot(req(payload()),o)));
  assert.ok(result.every(r=>[200,202].includes(r.status)));assert.equal(verify,1);assert.equal(settle,1);
  const restarted={...o,ledger:new Ledger(o.ledger.storage,{daily:1,total:1})};
  assert.equal((await handlePilot(req(payload()),restarted)).status,200);assert.equal(settle,1);
  assert.equal((await handlePilot(req(null,'main_'+'f'.repeat(32)),restarted)).status,429);
  assert.equal(JSON.stringify(o.ledger.row(id)).includes('signature'),false);
});
test('service exceptions, failed verification and uncertain settlements permanently stop; no automatic retry',async()=>{
  for(const client of [{verify:async()=>{throw Error('PRIVATE');}},{verify:async()=>({isValid:false})},
    {verify:async()=>({isValid:true}),settle:async()=>{throw Error('PRIVATE');}},
    {verify:async()=>({isValid:true}),settle:async()=>({success:true,network:'eip155:84532',transaction:hash})}]){
    const o={...opts(),client};const r=await handlePilot(req(payload()),o);assert.ok([202,422].includes(r.status));
    assert.equal((await r.json()).retry_payment,false);o.client=()=>{throw Error('must-not-repeat');};
    assert.ok([202,422].includes((await handlePilot(req(payload()),o)).status));
    assert.equal((await handlePilot(req(null,'main_'+'f'.repeat(32)),o)).status,429);
  }
});
