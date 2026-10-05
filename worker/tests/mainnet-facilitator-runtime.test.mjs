import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import {build} from 'esbuild';
import {builtinModules} from 'node:module';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {importJWK,jwtVerify} from 'jose';
import {encodePaymentSignatureHeader} from '@x402/core/http';
import {x402Client} from '@x402/core/client';import {ExactEvmScheme} from '@x402/evm/exact/client';
import {declarePaymentIdentifierExtension} from '@x402/extensions/payment-identifier';
import {pilotTerms,PILOT_NETWORK} from '../src/mainnet-pilot.js';
import {OWNER_PILOT_NONCE,OWNER_PILOT_VALID_AFTER} from '../../static/owner-pilot-v3.js';
import {RECEIVING_ADDRESS} from '../src/payment-core.js';
// Public RFC8032 vector, NOT a CDP account credential; never leaves local mock.
const seed='9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const publicHex='d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const fixture=Buffer.from(seed+publicHex,'hex').toString('base64'),hash='0x'+'a'.repeat(64),id='main3_'+'a'.repeat(32);
test('regression: pinned CDP /x402 aggregate export loses JWT initializer in workerd bundle, before ANY mocked HTTP request',async()=>{
 const source=`import {createCdpFacilitatorClient} from '@coinbase/cdp-sdk/x402';export default {async fetch(request,env){try{
 await createCdpFacilitatorClient({apiKeyId:env.CDP_API_KEY_ID,apiKeySecret:env.CDP_API_KEY_SECRET}).verify({},{});
 return Response.json({unexpected_success:true});}catch(e){return Response.json({name:e.name,random_initialization_missing:e.message==='getRandomValues is not a function'});}}};`;
 const bundle=await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('..',import.meta.url)),sourcefile:'local-old-client-regression.js'},bundle:true,write:false,format:'esm',platform:'browser',conditions:['workerd','worker','browser'],external:['node:*'],plugins:[{name:'nodejs-compat-builtins',setup(b){b.onResolve({filter:/.*/},args=>builtinModules.includes(args.path)?{path:'node:'+args.path,external:true}:undefined);}}],logLevel:'silent'});
 let calls=0;const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'local-old-client',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{CDP_API_KEY_ID:'public-rfc-fixture-not-a-cdp-key',CDP_API_KEY_SECRET:fixture},outboundService:()=>{calls++;throw Error('NO EXTERNAL SERVICE');}}]}));
 try{assert.deepEqual(await(await mf.dispatchFetch('https://local/check')).json(),{name:'TypeError',random_initialization_missing:true});assert.equal(calls,0);}finally{await mf.dispose();}
});
test('real pinned CDP client in workerd: exact SDK browser payload, POST JWTs, response boundaries and one-shot stop; ALL service calls mocked',async()=>{
 const pub=await importJWK({kty:'OKP',crv:'Ed25519',x:Buffer.from(publicHex,'hex').toString('base64url')},'EdDSA');
 let typed;const browser=new x402Client().register(PILOT_NETWORK,new ExactEvmScheme({address:RECEIVING_ADDRESS,signTypedData:async args=>{args.message.nonce=OWNER_PILOT_NONCE;args.message.validAfter=BigInt(OWNER_PILOT_VALID_AFTER);typed=args;return '0x'+'b'.repeat(130);}}));
 const challenge={x402Version:2,resource:{url:'https://aicqsohoo.com/contribution/mainnet/self-test'},accepts:[pilotTerms()],extensions:{'payment-identifier':declarePaymentIdentifierExtension(true)}};
 const payload=await browser.createPaymentPayload(challenge);payload.payload.authorization.nonce=OWNER_PILOT_NONCE;payload.payload.authorization.validAfter=OWNER_PILOT_VALID_AFTER;payload.extensions['payment-identifier'].info.id=id;
 assert.equal(typed.primaryType,'TransferWithAuthorization');assert.equal(Number(typed.domain.chainId),8453);assert.equal(typed.domain.verifyingContract,pilotTerms().asset);
 assert.equal(typed.message.from,RECEIVING_ADDRESS);assert.equal(typed.message.to,RECEIVING_ADDRESS);assert.equal(String(typed.message.value),'10000');assert.equal(typed.domain.name,'USDC');assert.equal(typed.domain.version,'2');
 const source=`import {handlePilot,cdpPilotClient} from './src/mainnet-pilot.js';import {Ledger} from './src/payment-core.js';
 export class Audit {constructor(ctx,env){this.ctx=ctx;this.env=env;this.ledger=new Ledger(ctx.storage,{daily:1,total:1});}
 async fetch(request){let error;const capture=e=>{error={name:e.name,message:String(e.message).replace(/[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+/g,'REDACTED_TOKEN')};throw e;};
 const response=await handlePilot(request,{mode:'owner-pilot-v3',ledger:this.ledger,client:()=>{try{const c=cdpPilotClient(this.env);return {verify:async(...args)=>{try{return await c.verify(...args);}catch(e){capture(e);}},settle:async(...args)=>{try{return await c.settle(...args);}catch(e){capture(e);}}};}catch(e){capture(e);}},verifyOwner:async()=>true});
 return Response.json({...await response.json(),LOCAL_FIXTURE_ERROR:error},{status:response.status});}}
 export default {fetch(request,env){return env.AUDIT.get(env.AUDIT.idFromName('LOCAL-MOCK-ONLY')).fetch(request);}};`;
 const bundle=await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('..',import.meta.url)),sourcefile:'local-facilitator-audit.js'},bundle:true,write:false,format:'esm',platform:'browser',conditions:['workerd','worker','browser'],external:['node:*'],plugins:[{name:'nodejs-compat-builtins',setup(b){b.onResolve({filter:/.*/},args=>builtinModules.includes(args.path)?{path:'node:'+args.path,external:true}:undefined);}}],logLevel:'silent'});
 for(const scenario of ['success','verify-invalid','verify-http400','verify-http500','verify-json','verify-schema','settle-http500','settle-negative','settle-schema','missing-credentials','invalid-credentials']){
  const calls=[];
  const outbound=async request=>{
   const op=new URL(request.url).pathname.split('/').pop();calls.push(op);
   assert.ok(['verify','settle'].includes(op));assert.equal(request.method,'POST');assert.equal(request.url,'https://api.cdp.coinbase.com/platform/v2/x402/'+op);
   assert.equal(request.headers.get('content-type'),'application/json');assert.equal(request.headers.get('Correlation-Context'),'sdkLanguage=typescript,source=cdp-sdk,sourceVersion=1.57.1');assert.equal(request.headers.has('X-Wallet-Auth'),false);
   const token=request.headers.get('Authorization').replace(/^Bearer /,'');const {payload:jwt,protectedHeader}=await jwtVerify(token,pub,{algorithms:['EdDSA']});
   assert.deepEqual(jwt.uris,['POST api.cdp.coinbase.com/platform/v2/x402/'+op]);assert.equal(jwt.sub,'public-rfc-fixture-not-a-cdp-key');assert.equal(jwt.iss,'cdp');assert.equal(jwt.exp-jwt.iat,120);assert.equal('aud' in jwt,false);assert.equal(protectedHeader.alg,'EdDSA');
   const body=await request.json();assert.equal(body.x402Version,2);assert.deepEqual(body.paymentRequirements,pilotTerms());assert.deepEqual(body.paymentPayload,payload);
   if(op==='verify'){
    if(scenario==='verify-invalid')return Response.json({isValid:false,invalidReason:'invalid_signature'});
    if(scenario==='verify-http400')return Response.json({isValid:false,invalidReason:'invalid_signature',invalidMessage:'PRIVATE'}, {status:400});
    if(scenario==='verify-http500')return Response.json({errorType:'internal_server_error',errorMessage:'PRIVATE'}, {status:500});
    if(scenario==='verify-json')return new Response('PRIVATE NOT JSON');
    if(scenario==='verify-schema')return Response.json({isValid:'true',secret:'PRIVATE'});
    return Response.json({isValid:true,payer:RECEIVING_ADDRESS});
   }
   if(scenario==='settle-http500')return Response.json({success:false,errorReason:'transaction_failed',errorMessage:'PRIVATE',transaction:hash,network:PILOT_NETWORK},{status:500});
   if(scenario==='settle-negative')return Response.json({success:false,errorReason:'transaction_failed',transaction:hash,network:PILOT_NETWORK});
   if(scenario==='settle-schema')return Response.json({success:true,network:PILOT_NETWORK});
   return Response.json({success:true,transaction:hash,network:PILOT_NETWORK,payer:RECEIVING_ADDRESS});
  };
  const bindings={CDP_API_KEY_ID:'public-rfc-fixture-not-a-cdp-key',CDP_API_KEY_SECRET:scenario==='invalid-credentials'?'not-a-key':fixture};if(scenario==='missing-credentials')delete bindings.CDP_API_KEY_SECRET;
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'local-mock-facilitator',modules:true,script:process.env.AICQ_AUDIT_DEPLOYED_BUNDLE==='1'?readFileSync(process.env.AICQ_AUDIT_BUNDLE_PATH||new URL('../.wrangler/dryrun/index.js',import.meta.url),'utf8')+'\n'+source.slice(source.indexOf('export class Audit'),source.indexOf('export default')):bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],durableObjects:{AUDIT:{className:'Audit',useSQLite:true},MAINNET_PAYMENTS:{className:'Audit',useSQLite:true}},bindings,outboundService:outbound}]}));
  try{
   const invoke=()=>mf.dispatchFetch('https://local/contribution/mainnet/self-test',{method:'POST',headers:{Origin:'https://aicqsohoo.com','content-type':'application/json','PAYMENT-SIGNATURE':encodePaymentSignatureHeader(payload)},body:JSON.stringify({id,terms_version:'mainnet-pilot-v3',consent:true,owner_authorized:true})});
   const first=await invoke(),result=await first.json();assert.equal(result.state,scenario==='success'?'settled':scenario==='verify-invalid'?'failed':'pending',scenario+' '+JSON.stringify(result));const {LOCAL_FIXTURE_ERROR,...publicResult}=result;assert.equal(JSON.stringify(publicResult).includes('PRIVATE'),false);
   if(scenario!=='success'){
    assert.equal(result.diagnostic.stage,scenario==='missing-credentials'?'client_setup':scenario.startsWith('settle-')?'settle':'verify');
    if(scenario==='verify-http400')assert.equal(result.diagnostic.http_status,400);
    if(scenario==='verify-json'||scenario==='verify-schema'||scenario==='settle-schema')assert.equal(result.diagnostic.kind,'sdk_response_invalid');
    if(scenario==='settle-http500'||scenario==='settle-negative')assert.equal(result.diagnostic.candidate_transaction,hash);
    if(scenario==='verify-http500')assert.equal('http_status' in result.diagnostic,false,'generic SDK exception must not invent remote HTTP provenance');
   }
   assert.equal(calls.length,scenario.endsWith('credentials')?0:scenario==='success'||scenario.startsWith('settle-')?2:1,scenario);
   const before=calls.length;assert.equal((await (await invoke()).json()).state,result.state);assert.equal(calls.length,before,'no provider retry');
   if(scenario==='success')assert.equal(result.transaction,hash);
  }finally{await mf.dispose();}
 }
});
