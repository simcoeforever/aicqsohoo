import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';import {jwtVerify,importJWK} from 'jose';
import {encodePaymentSignatureHeader} from '@x402/core/http';import {pilotTerms} from '../src/mainnet-pilot.js';
import {OWNER_PILOT_NONCE,OWNER_PILOT_VALID_AFTER} from '../../static/owner-pilot-v3.js';
const seed='9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',pubhex='d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
test('EXACT Wrangler production bundle: fresh generation, historical DO preservation, real auth JWT, old signatures rejected, no real network', {skip:process.env.AICQ_AUDIT_DEPLOYED_BUNDLE!=='1'},async()=>{
 const pub=await importJWK({kty:'OKP',crv:'Ed25519',x:Buffer.from(pubhex,'hex').toString('base64url')},'EdDSA');let authCalls=0;
 const mf=new Miniflare(convertV4MiniflareOptions({unsafeInspectDurableObjects:true,workers:[{name:'generation-bundle',modules:true,script:readFileSync(process.env.AICQ_AUDIT_BUNDLE_PATH||new URL('../.wrangler/dryrun/index.js',import.meta.url),'utf8'),compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],durableObjects:{COUNTER:{className:'Counter',useSQLite:true},PAYMENTS:{className:'Payments',useSQLite:true},MAINNET_PAYMENTS:{className:'MainnetPayments',useSQLite:true}},bindings:{MAINNET_PAYMENT_MODE:'owner-pilot-v3',PAYMENT_MODE:'testnet',METRICS_ENABLED:'false',EDGE_ENABLED:'false',CDP_API_KEY_ID:'public-rfc-fixture-not-a-cdp-key',CDP_API_KEY_SECRET:Buffer.from(seed+pubhex,'hex').toString('base64')},outboundService:async request=>{
  assert.equal(request.method,'GET');assert.equal(request.url,'https://api.cdp.coinbase.com/platform/v2/x402/supported');authCalls++;
  const {payload}=await jwtVerify(request.headers.get('Authorization').replace(/^Bearer /,''),pub,{algorithms:['EdDSA']});assert.deepEqual(payload.uris,['GET api.cdp.coinbase.com/platform/v2/x402/supported']);
  return Response.json({kinds:[{x402Version:2,scheme:'exact',network:'eip155:8453'}]});
 }}]}));
 const old='main_'+'a'.repeat(32),previous='main2_'+'c'.repeat(32),fresh='main3_'+'b'.repeat(32),call=(path,init)=>mf.dispatchFetch('https://local'+path,init);
 try{
  assert.equal((await call('/contribution/mainnet/receipt/'+old)).status,404);
  // Local, nonpersistent mock DO only; never access or change production storage.
  await mf.unsafeEvictDurableObject('generation-bundle','MainnetPayments',{name:'base-mainnet-pilot-v1'});
  const oldStorage=await mf.unsafeGetDurableObjectStorage('generation-bundle','MainnetPayments',{name:'base-mainnet-pilot-v1'});
  await oldStorage.exec('INSERT INTO contributions (id,terms,day,state) VALUES (?,?,?,?)',old,'unchanged-old-terms','2026-10-05','pending');
  const before=await oldStorage.exec('SELECT * FROM contributions');
  assert.equal((await call('/contribution/mainnet/receipt/'+previous)).status,404);
  await mf.unsafeEvictDurableObject('generation-bundle','MainnetPayments',{name:'base-mainnet-pilot-v2'});
  const previousStorage=await mf.unsafeGetDurableObjectStorage('generation-bundle','MainnetPayments',{name:'base-mainnet-pilot-v2'});
  await previousStorage.exec('INSERT INTO contributions (id,terms,day,state) VALUES (?,?,?,?)',previous,'unchanged-generation2-terms','2026-10-05','pending');
  await previousStorage.exec('CREATE TABLE pilot_diagnostics (id TEXT PRIMARY KEY, diagnostic TEXT NOT NULL)');
  const previousDiagnostic={stage:'verify',kind:'provider_rejected',http_status:400};
  await previousStorage.exec('INSERT INTO pilot_diagnostics (id,diagnostic) VALUES (?,?)',previous,JSON.stringify(previousDiagnostic));
  const previousBefore=await previousStorage.exec('SELECT * FROM contributions'),diagnosticBefore=await previousStorage.exec('SELECT * FROM pilot_diagnostics');
  const info=await(await call('/contribution/mainnet/info')).json();assert.equal(info.enabled,true);assert.equal(info.generation,3);assert.equal(info.ledger_name,'base-mainnet-pilot-v3');assert.equal(info.receipt_prefix,'main3_');assert.equal(info.authorization_nonce,OWNER_PILOT_NONCE);assert.equal(info.authorization_valid_after,OWNER_PILOT_VALID_AFTER);
  assert.deepEqual(await(await call('/contribution/mainnet/receipt/'+old)).json(),{id:old,state:'pending',retry_payment:false});
  assert.equal((await(await call('/contribution/mainnet/v1/info')).json()).consumed,1);
  assert.deepEqual(await(await call('/contribution/mainnet/receipt/'+previous)).json(),{id:previous,state:'pending',retry_payment:false,diagnostic:previousDiagnostic});
  assert.deepEqual(await(await call('/contribution/mainnet/v2/info')).json(),{generation:2,enabled:false,payment_mode:'off',ledger_name:'base-mainnet-pilot-v2',total_cap:1,consumed:1});
  const newStorage=await mf.unsafeGetDurableObjectStorage('generation-bundle','MainnetPayments',{name:'base-mainnet-pilot-v3'});
  for(const legacy of [true,false]){
   const id=legacy?old:fresh,authorization={from:info.payer,to:info.recipient,value:'10000',validAfter:'0',validBefore:String(Math.floor(Date.now()/1000)+180),nonce:'0x'+'c'.repeat(64)};
   const p={x402Version:2,accepted:pilotTerms(),extensions:{'payment-identifier':{info:{id,required:true}}},payload:{authorization,signature:'0x'+'b'.repeat(130)}};
   const r=await call('/contribution/mainnet/self-test',{method:'POST',headers:{Origin:'https://aicqsohoo.com','Content-Type':'application/json','PAYMENT-SIGNATURE':encodePaymentSignatureHeader(p)},body:JSON.stringify({id,terms_version:legacy?'mainnet-pilot-v1':'mainnet-pilot-v3',consent:true,owner_authorized:true})});assert.equal(r.status,legacy?400:409);
  }
  assert.equal((await newStorage.exec('SELECT COUNT(*) AS n FROM contributions'))[0].n,0);assert.equal(authCalls,0);
  const authorization={from:info.payer,to:info.recipient,value:'10000',validAfter:OWNER_PILOT_VALID_AFTER,validBefore:String(Math.floor(Date.now()/1000)+180),nonce:OWNER_PILOT_NONCE};
  for(const change of [{id:previous,terms_version:'mainnet-pilot-v2'},{nonce:'0xec464afbfd8603a33eceff4adffd5da4b6122b95b89d8d62fdb6d265c990800b'},{validAfter:'1791166500'},{}]){
    const id=change.id||fresh,a={...authorization,...change};delete a.id;delete a.terms_version;
    const p={x402Version:2,accepted:pilotTerms(),extensions:{'payment-identifier':{info:{id,required:true}}},payload:{authorization:a,signature:'0x'+'b'.repeat(130)}};
    const r=await call('/contribution/mainnet/self-test',{method:'POST',headers:{Origin:'https://aicqsohoo.com','Content-Type':'application/json','PAYMENT-SIGNATURE':encodePaymentSignatureHeader(p)},body:JSON.stringify({id,terms_version:change.terms_version||'mainnet-pilot-v3',consent:true,owner_authorized:true})});
    assert.equal(r.status,change.id?400:change.nonce||change.validAfter?409:403);
  }
  assert.equal((await newStorage.exec('SELECT COUNT(*) AS n FROM contributions'))[0].n,0);assert.equal(authCalls,0);
  const auth=await(await call('/contribution/mainnet/auth-status')).json();assert.equal(auth.authenticated,true);assert.equal(auth.status,200);assert.equal(auth.check_version,'owner-pilot-v3-auth-2026-10-05');assert.equal(auth.payment_performed,false);
  await call('/contribution/mainnet/auth-status');assert.equal(authCalls,1);
  assert.deepEqual(await oldStorage.exec('SELECT * FROM contributions'),before);
  assert.deepEqual(await previousStorage.exec('SELECT * FROM contributions'),previousBefore);
  assert.deepEqual(await previousStorage.exec('SELECT * FROM pilot_diagnostics'),diagnosticBefore);
  const testnet=await(await call('/contribution/info')).json();assert.equal(testnet.enabled,true);assert.equal(testnet.network,'eip155:84532');
 }finally{await mf.dispose();}
});
