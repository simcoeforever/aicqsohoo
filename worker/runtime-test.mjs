// Run after Wrangler's local dry-run bundle. No account, DNS or remote service.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const options = {
  workers: [{ name: 'counter',
  modules: true,
  scriptPath: fileURLToPath(new URL('./.wrangler/dryrun/index.js', import.meta.url)),
  compatibilityDate: '2026-09-01',
  compatibilityFlags: ['nodejs_compat'],
  durableObjects: {COUNTER: {className: 'Counter', useSQLite: true},PAYMENTS:{className:'Payments',useSQLite:true},MAINNET_PAYMENTS:{className:'MainnetPayments',useSQLite:true}},
  bindings: {PAYMENT_MODE:'testnet',METRICS_ENABLED:'true', PUBLIC_SUMMARY:'false', EDGE_ENABLED:'false',
    PUBLIC_PAGES:'["/","/submit/","/about/","/experiment/"]', REPORT_TOKEN:'runtime-test-only'},
  outboundService: request => {
    if(request.url==='https://x402.org/facilitator/supported')return Response.json({kinds:[{x402Version:2,scheme:'exact',network:'eip155:84532'}],extensions:[],signers:{}});
    if (new URL(request.url).origin === 'https://aicqsohoo.com') return new Response('mocked GitHub Pages origin');
    throw new Error('External network forbidden in this runtime test');
  },
  }],
};
const mf = new Miniflare(convertV4MiniflareOptions(options));
try {
  const headers = {Origin:'https://aicqsohoo.com', 'Content-Type':'application/json'};
  const call = (path, init) => mf.dispatchFetch('https://counter.example'+path, init);
  assert.equal((await call('/hit')).status,200);
  assert.equal((await (await call('/hit')).json()).count,0);
  await Promise.all(Array.from({length:42},()=>call('/hit',{method:'POST',headers})));
  assert.equal((await (await call('/hit')).json()).count,42);
  const mainnetInfo=await (await call('/contribution/mainnet/info')).json();
  assert.equal(mainnetInfo.enabled,false);assert.equal(mainnetInfo.network,'eip155:8453');
  assert.equal(mainnetInfo.amount_atomic,'10000');assert.equal(mainnetInfo.total_cap,1);
  const auth=await (await call('/contribution/mainnet/auth-status')).json();
  assert.equal(auth.authenticated,null);assert.equal(auth.payment_performed,false);
  assert.equal(auth.check_state,'completed'); // No fixture key bindings, therefore no network call.
  for(const mode of ['off','mainnet','true','testnet']){
    options.workers[0].bindings.MAINNET_PAYMENT_MODE=mode;await mf.setOptions(convertV4MiniflareOptions(options));
    for(const path of ['/contribution/mainnet','/contribution/mainnet/start','/contribution/mainnet/test','/contribution/mainnet/supported']){
      const denied=await call(path,{method:'POST',headers,body:'{}'});
      assert.equal(denied.status,503);assert.equal(denied.headers.has('PAYMENT-REQUIRED'),false);
    }
  }
  options.workers[0].bindings.MAINNET_PAYMENT_MODE='owner-pilot';await mf.setOptions(convertV4MiniflareOptions(options));
  const pilotInfo=await (await call('/contribution/mainnet/info')).json();
  assert.equal(pilotInfo.enabled,true);assert.equal(pilotInfo.owner_only,true);assert.equal(pilotInfo.general_contributions_enabled,false);
  const pilotBody={id:'main_'+'a'.repeat(32),terms_version:'mainnet-pilot-v1',consent:true,owner_authorized:true};
  for(let i=0;i<3;i++)assert.equal((await call('/contribution/mainnet/self-test',{method:'POST',headers,body:JSON.stringify(pilotBody)})).status,402);
  const {encodePaymentSignatureHeader}=await import('@x402/core/http');
  const {pilotTerms}=await import('./src/mainnet-pilot.js');
  const forged=encodePaymentSignatureHeader({x402Version:2,accepted:pilotTerms(),extensions:{'payment-identifier':{info:{required:true,id:pilotBody.id}}},payload:{signature:'0x'+'b'.repeat(130),authorization:{from:pilotInfo.payer,to:pilotInfo.recipient,value:'10000',validAfter:'0',validBefore:String(Math.floor(Date.now()/1000)+180),nonce:'0x'+'c'.repeat(64)}}});
  assert.equal((await call('/contribution/mainnet/self-test',{method:'POST',headers:{...headers,'PAYMENT-SIGNATURE':forged},body:JSON.stringify(pilotBody)})).status,403);
  assert.equal((await (await call('/contribution/mainnet/info')).json()).enabled,true);
  assert.equal((await call('/contribution/mainnet/self-test',{method:'POST',headers:{...headers,Origin:'https://attacker.invalid'},body:JSON.stringify(pilotBody)})).status,403);
  const paymentBody={id:'pay_'+'c'.repeat(32),terms_version:'test-contribution-v1',consent:true,owner_authorized:true};
  const payment=await mf.dispatchFetch('https://aicqsohoo.com/contribution/test?measurement=test',{method:'POST',headers,body:JSON.stringify(paymentBody)});
  assert.equal(payment.status,402);assert.ok(payment.headers.get('PAYMENT-REQUIRED'));
  const terms=await payment.json();assert.equal(terms.accepts[0].network,'eip155:84532');assert.equal(terms.accepts[0].amount,'10000');
  assert.equal((await call('/contribution/receipt/'+paymentBody.id)).status,404,'validation probe must not create a payment record');
  for(let n=0;n<5;n++)assert.equal((await call('/contribution/test',{method:'POST',headers,body:JSON.stringify({...paymentBody,id:'pay_'+String(n).padStart(32,'0')})})).status,402);
  assert.equal((await call('/contribution/test',{method:'POST',headers,body:JSON.stringify(paymentBody)})).status,429);
  options.workers[0].bindings.PAYMENT_MODE='off';await mf.setOptions(convertV4MiniflareOptions(options));
  assert.equal((await call('/contribution/test',{method:'POST',headers,body:JSON.stringify(paymentBody)})).status,503);
  options.workers[0].bindings.PAYMENT_MODE='mainnet';await mf.setOptions(convertV4MiniflareOptions(options));
  assert.equal((await call('/contribution/test',{method:'POST',headers,body:JSON.stringify(paymentBody)})).status,503);
  const event = {page:'/',event:'page_view',source:'search.example',test:false};
  for (let i=0;i<12;i++) {
    assert.equal((await call('/event',{method:'POST',headers,body:JSON.stringify(event)})).status,202);
  }
  assert.equal((await (await call('/hit')).json()).count,42);
  assert.equal((await call('/event',{method:'POST',headers,body:'x'.repeat(1025)})).status,413);
  assert.equal((await call('/event',{method:'POST',headers,body:JSON.stringify({...event,user_agent:'<script>evil</script>'})})).status,400);
  const now = new Date(); now.setUTCDate(now.getUTCDate()-((now.getUTCDay()+6)%7)-7);
  const path = '/summary?start='+now.toISOString().slice(0,10);
  assert.equal((await call(path)).status,401);
  assert.equal((await call(path,{headers:{Authorization:'Bearer wrong'}})).status,401);
  const response = await call(path,{headers:{Authorization:'Bearer runtime-test-only'}});
  assert.equal(response.status,200);
  const summary = await response.json();
  assert.equal(summary.schema,2); assert.equal(summary.page_views,null);
  assert.equal(summary.resource_gets,null); assert.equal('rows' in summary,false);
  options.workers[0].bindings.PUBLIC_SUMMARY='true';
  options.workers[0].bindings.EDGE_ENABLED='true';
  delete options.workers[0].bindings.REPORT_TOKEN;
  await mf.setOptions(convertV4MiniflareOptions(options));
  const publicResponse=await call(path);
  assert.equal(publicResponse.status,200);
  const publicSummary=await publicResponse.json();
  assert.equal(publicSummary.started,null); assert.equal(publicSummary.coverage,'not_verified');
  for (const resource of ['/','/ja/about/','/ja/experiment/2026-10-04-measurement/','/experiences.json','/llms.txt']) {
    const response=await mf.dispatchFetch('https://aicqsohoo.com'+resource+'?measurement=test&private=not-stored');
    assert.equal(response.headers.get('X-AICQSOHOO-Test-Measurement'),'recorded');
    assert.equal(response.status,200); assert.equal(await response.text(),'mocked GitHub Pages origin');
  }
  assert.equal((await (await call('/hit')).json()).count,42);
  console.log('workerd runtime: disabled isolated mainnet, existing testnet, concurrency, SQL/RPC/alarm setup, auth, limits, summary and mocked-origin JS-free GETs passed');
} finally { await mf.dispose(); }
