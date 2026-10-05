import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Ledger} from '../src/payment-core.js';
import {MainnetPreparationService,MAINNET_PROFILE} from '../src/mainnet-preparation.js';
function storage(){const db=new DatabaseSync(':memory:');return {sql:{exec(sql,...args){const rows=db.prepare(sql).all(...args);return {toArray:()=>rows};}},transactionSync(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};}
test('mainnet cannot be enabled by an environment flag or signed request; no ledger rows are created',async()=>{
  const s=storage(),service=new MainnetPreparationService({storage:s});
  const info=await (await service.fetch(new Request('https://local/contribution/mainnet/info'))).json();
  assert.equal(info.enabled,false);assert.equal(info.network,'eip155:8453');assert.equal(info.amount_atomic,'10000');
  assert.equal(info.asset,'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');assert.equal(info.daily_cap,1);assert.equal(info.total_cap,1);
  for(const path of ['/contribution/mainnet/start','/contribution/mainnet/test','/contribution/mainnet/verify','/contribution/mainnet/settle','/contribution/mainnet/supported']){
    const r=await service.fetch(new Request('https://local'+path,{method:'POST',headers:{'PAYMENT-SIGNATURE':'fabricated-fixture'},body:'{}'}));
    assert.equal(r.status,503);assert.equal(r.headers.has('PAYMENT-REQUIRED'),false);
  }
  assert.equal(s.sql.exec('SELECT COUNT(*) AS n FROM contributions').toArray()[0].n,0);
});
test('separate pilot ledger consumes at most one start permanently, including failure/unknown and restart',()=>{
  assert.notEqual(MAINNET_PROFILE.ledger_name,'base-sepolia-test-v1');
  for(const state of ['created','failed','pending','settled']){
    const s=storage(),pilot=new Ledger(s,{daily:1,total:1});
    assert.ok(pilot.create('main_'+'a'.repeat(32),'mainnet-terms','2026-10-04').row);
    pilot.state('main_'+'a'.repeat(32),state);
    const restarted=new Ledger(s,{daily:1,total:1});
    assert.equal(restarted.create('main_'+'b'.repeat(32),'mainnet-terms','2026-10-04').error,429);
    assert.equal(restarted.create('main_'+'b'.repeat(32),'mainnet-terms','2026-10-05').error,429);
    const separateTestnet=new Ledger(storage());
    for(let n=0;n<5;n++)assert.ok(separateTestnet.create('pay_'+n,'testnet-terms','2026-10-04').row);
  }
});
test('public auth status causes at most one supported check per version, even concurrency/restart; never stores keys or IDs',async()=>{
  const s=storage(),kv=new Map();s.get=async k=>kv.get(k);s.put=async(k,v)=>kv.set(k,v);
  const ctx={storage:s,blockConcurrencyWhile:fn=>fn()};let calls=0;
  const check=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return {authenticated:true,response_source:'remote_http',status:200,base_exact_v2:true,request_id:'must-not-store',error_code:'must-not-store'};};
  const service=new MainnetPreparationService(ctx,{CDP_API_KEY_ID:'fixture-only',CDP_API_KEY_SECRET:'must-not-store'},check);
  const req=()=>new Request('https://local/contribution/mainnet/auth-status');
  const responses=await Promise.all(Array.from({length:10},()=>service.fetch(req())));
  assert.equal(calls,1);assert.equal((await responses[0].json()).authenticated,true);
  const restarted=new MainnetPreparationService(ctx,{},()=>{throw Error('MUST_NOT_RECHECK');});
  assert.equal((await (await restarted.fetch(req())).json()).authenticated,true);
  assert.equal(JSON.stringify([...kv.values()]).includes('must-not-store'),false);
  assert.equal(s.sql.exec('SELECT COUNT(*) AS n FROM contributions').toArray()[0].n,0);
});
