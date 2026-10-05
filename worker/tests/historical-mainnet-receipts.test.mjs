import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {MainnetPreparationService} from '../src/mainnet-preparation.js';import {paymentRoute} from '../src/payments.js';
test('all four historical receipt GETs preserve rows, diagnostics and consumed slots through the production router',async()=>{
 const instances=new Map(),lookups=[];let remote=0;
 const binding={idFromName:name=>name,get(name){lookups.push(name);if(!instances.has(name)){
  const db=new DatabaseSync(':memory:');const storage={sql:{exec(q,...a){const rows=db.prepare(q).all(...a);return {toArray:()=>rows};}},get:async()=>{throw Error('unexpected KV read');},put:async()=>{throw Error('unexpected KV write');}};
  const service=new MainnetPreparationService({storage,blockConcurrencyWhile:fn=>fn()},{MAINNET_PAYMENT_MODE:'owner-pilot-v5'},async()=>{remote++;throw Error('unexpected provider');});instances.set(name,{db,service});
 }return {fetch:r=>instances.get(name).service.fetch(r)};}};
 const env={MAINNET_PAYMENTS:binding};
 for(let generation=1;generation<=4;generation++){
  const name='base-mainnet-pilot-v'+generation,prefix=generation===1?'main_':'main'+generation+'_',id=prefix+'a'.repeat(32),path='/contribution/mainnet/receipt/'+id;
  binding.get(name);const {db}=instances.get(name);db.prepare('INSERT INTO contributions (id,terms,day,state) VALUES (?,?,?,?)').run(id,'unchanged historical terms','2026-10-05','pending');
  db.exec('CREATE TABLE pilot_diagnostics (id TEXT PRIMARY KEY, diagnostic TEXT NOT NULL)');const diagnostic={stage:'verify',kind:'provider_rejected',http_status:400};db.prepare('INSERT INTO pilot_diagnostics VALUES (?,?)').run(id,JSON.stringify(diagnostic));
  const before=db.prepare('SELECT * FROM contributions').all(),diagBefore=db.prepare('SELECT * FROM pilot_diagnostics').all();
  const r=await paymentRoute(new Request('https://local'+path),env);assert.equal(r.status,202);assert.deepEqual(await r.json(),{id,state:'pending',retry_payment:false,diagnostic});assert.equal(lookups.at(-1),name);
  const info=await(await paymentRoute(new Request('https://local/contribution/mainnet/v'+generation+'/info'),env)).json();assert.equal(info.consumed,1);assert.equal(info.enabled,false);assert.equal(info.generation,generation);
  assert.deepEqual(db.prepare('SELECT * FROM contributions').all(),before);assert.deepEqual(db.prepare('SELECT * FROM pilot_diagnostics').all(),diagBefore);
  assert.equal((await paymentRoute(new Request('https://local/contribution/mainnet/receipt/'+prefix+'b'.repeat(32)),env)).status,404);
 }
 assert.equal(remote,0);assert.equal(instances.size,4);assert.equal(instances.has('base-mainnet-pilot-v5'),false);
});
