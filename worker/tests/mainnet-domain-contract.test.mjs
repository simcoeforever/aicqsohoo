import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {hashDomain,verifyTypedData} from 'viem';import {privateKeyToAccount} from 'viem/accounts';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {x402Client} from '@x402/core/client';import {ExactEvmScheme} from '@x402/evm/exact/client';import {encodePaymentSignatureHeader} from '@x402/core/http';
import {pilotTerms,pilotAuthorizationDomain,verifyOwnerAuthorization} from '../src/mainnet-pilot.js';import {requirements,RECEIVING_ADDRESS} from '../src/payment-core.js';
const evidence=JSON.parse(readFileSync(new URL('./fixtures/usdc-domains-onchain-2026-10-05.json',import.meta.url)));
// Expected domains and token metadata come from direct public eth_call snapshots,
// not application constants. Public local fixture account; no owner's key/payload.
const main=evidence.reports.find(r=>r.chainId===8453),sep=evidence.reports.find(r=>r.chainId===84532);
const fixture=privateKeyToAccount('0x'+'11'.repeat(32));
const domainTypes={EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}]};
const types={TransferWithAuthorization:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}]};
const message={from:fixture.address,to:fixture.address,value:10000n,validAfter:1791181200n,validBefore:1791181800n,nonce:'0x'+'22'.repeat(32)};
test('independent two-RPC onchain domains, decimals and pinned SDK exact payload agree for BOTH networks',async()=>{
 for(const canonical of [main,sep]){
  const replicas=evidence.reports.filter(r=>r.chainId===canonical.chainId);assert.equal(replicas.length,2);assert.equal(new Set(replicas.map(r=>r.domain_separator)).size,1);
  assert.equal(canonical.decimals,6);assert.equal(hashDomain({domain:canonical.domain,types:domainTypes}),canonical.domain_separator);
  const terms=canonical===main?pilotTerms():requirements(RECEIVING_ADDRESS);assert.equal(terms.asset,canonical.address);assert.equal(terms.network,'eip155:'+canonical.chainId);assert.equal(terms.scheme,'exact');assert.equal(terms.amount,(10n**BigInt(canonical.decimals)/100n).toString());assert.equal(terms.extra.name,canonical.name);assert.equal(terms.extra.version,canonical.version);assert.equal(terms.payTo,RECEIVING_ADDRESS);assert.equal(terms.maxTimeoutSeconds,300);
  let typed;const before=Math.floor(Date.now()/1000);const sdk=new x402Client().register(terms.network,new ExactEvmScheme({address:fixture.address,signTypedData:async args=>{typed=args;return fixture.signTypedData(args);}}));
  const p=await sdk.createPaymentPayload({x402Version:2,resource:{url:'https://local/fixture'},accepts:[terms]});const after=Math.floor(Date.now()/1000);
  assert.deepEqual({...typed.domain,chainId:Number(typed.domain.chainId)},canonical.domain);assert.deepEqual(typed.types,types);assert.equal(typed.primaryType,'TransferWithAuthorization');assert.equal(typed.message.from,fixture.address);assert.equal(typed.message.to,RECEIVING_ADDRESS);assert.equal(BigInt(typed.message.value),10000n);assert.ok(BigInt(typed.message.validAfter)<=BigInt(before));assert.ok(BigInt(typed.message.validBefore)>BigInt(after));assert.ok(BigInt(typed.message.validBefore)<=BigInt(after+300));assert.match(typed.message.nonce,/^0x[0-9a-f]{64}$/i);
  assert.equal(await verifyTypedData({...typed,domain:canonical.domain,address:fixture.address,signature:p.payload.signature}),true);
 }
 assert.deepEqual(pilotAuthorizationDomain(),main.domain);
});
test('actual Wrangler upload bytes: canonical crypto succeeds and old mainnet domain signature rejected; no external calls or quota consumed', {skip:!process.env.AICQ_DOMAIN_BUNDLE},async()=>{
 const bundle=readFileSync(process.env.AICQ_DOMAIN_BUNDLE,'utf8');const digest=createHash('sha256').update(bundle).digest('hex');let calls=0;
 // Append a LOCAL ONLY DO to expose the actual bundled production verifier/domain
 // for a public fixture account. Production bundle bytes remain intact as prefix.
 const audit=`export class DomainAudit {async fetch(request){const body=await request.json();return Response.json({domain:pilotAuthorizationDomain(),valid:await verifyTypedData({address:body.address,domain:pilotAuthorizationDomain(),types:AUTHORIZATION_TYPES,primaryType:'TransferWithAuthorization',message:{...body.message,value:BigInt(body.message.value),validAfter:BigInt(body.message.validAfter),validBefore:BigInt(body.message.validBefore)},signature:body.signature})});}}`;
 const mf=new Miniflare(convertV4MiniflareOptions({unsafeInspectDurableObjects:true,workers:[{name:'domain-upload-audit',modules:true,script:bundle+'\n'+audit,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],durableObjects:{COUNTER:{className:'Counter',useSQLite:true},PAYMENTS:{className:'Payments',useSQLite:true},MAINNET_PAYMENTS:{className:'MainnetPayments',useSQLite:true},DOMAIN_AUDIT:{className:'DomainAudit',useSQLite:true}},bindings:{MAINNET_PAYMENT_MODE:'owner-pilot-v5',PAYMENT_MODE:'testnet',METRICS_ENABLED:'false',EDGE_ENABLED:'false'},outboundService:()=>{calls++;throw Error('NO NETWORK');}}]}));
 try{
  const bindings=await mf.getBindings('domain-upload-audit');const auditStub=bindings.DOMAIN_AUDIT.get(bindings.DOMAIN_AUDIT.idFromName('public-local-fixture'));
  for(const mutation of [null,{name:'USDC'},{version:'1'},{chainId:84532},{verifyingContract:sep.address}]){const signature=await fixture.signTypedData({domain:mutation?{...main.domain,...mutation}:main.domain,types,primaryType:'TransferWithAuthorization',message});const r=await auditStub.fetch('https://local/audit',{method:'POST',body:JSON.stringify({address:fixture.address,message,signature},(_,v)=>typeof v==='bigint'?v.toString():v)});const result=await r.json();assert.deepEqual(result.domain,main.domain);assert.equal(result.valid,mutation===null);}
  const id='main5_'+'d'.repeat(32),info=await(await mf.dispatchFetch('https://local/contribution/mainnet/info')).json();
  const auth={from:info.payer,to:info.recipient,value:'10000',validAfter:info.authorization_valid_after,validBefore:String(Math.floor(Date.now()/1000)+180),nonce:info.authorization_nonce};
  const bad=await fixture.signTypedData({domain:{...main.domain,name:'USDC'},types,primaryType:'TransferWithAuthorization',message:{...auth,value:10000n,validAfter:BigInt(auth.validAfter),validBefore:BigInt(auth.validBefore)}});
  const p={x402Version:2,accepted:{scheme:'exact',network:'eip155:8453',asset:main.address,amount:'10000',payTo:info.recipient,maxTimeoutSeconds:300,extra:{name:'USDC',version:main.version}},extensions:{'payment-identifier':{info:{id,required:true}}},payload:{authorization:auth,signature:bad}};
  const init={method:'POST',headers:{Origin:'https://aicqsohoo.com','Content-Type':'application/json','PAYMENT-SIGNATURE':encodePaymentSignatureHeader(p)},body:JSON.stringify({id,terms_version:'mainnet-pilot-v5',consent:true,owner_authorized:true})};
  assert.equal((await mf.dispatchFetch('https://local/contribution/mainnet/self-test',init)).status,409);
  p.accepted.extra.name=main.name;init.headers['PAYMENT-SIGNATURE']=encodePaymentSignatureHeader(p);assert.equal((await mf.dispatchFetch('https://local/contribution/mainnet/self-test',init)).status,403);
  const storage=await mf.unsafeGetDurableObjectStorage('domain-upload-audit','MainnetPayments',{name:'base-mainnet-pilot-v5'});assert.equal((await storage.exec('SELECT COUNT(*) AS n FROM contributions'))[0].n,0);assert.equal(calls,0);console.log('domain audit exact-prefix bundle sha256='+digest);
 }finally{await mf.dispose();}
});
test('owner authorization time/nonce/value/payer boundaries fail closed independently of facilitator',async()=>{
 const now=1791181800,a={from:RECEIVING_ADDRESS,to:RECEIVING_ADDRESS,value:'10000',validAfter:'1791181200',validBefore:String(now+180),nonce:'0xe6fa5f7ffed5793003f6f8d41285c1dc438caa38287479be8e8d7161b58512bc'};
 for(const change of [{validAfter:String(now+1)},{validBefore:String(now)},{validBefore:String(now+301)},{nonce:'0x'+'00'.repeat(32)},{value:'9999'},{value:'10001'},{from:fixture.address},{to:fixture.address},{extra:'unexpected'}])assert.equal(await verifyOwnerAuthorization({payload:{authorization:{...a,...change},signature:'0x'+'00'.repeat(65)}},now),false);
});
