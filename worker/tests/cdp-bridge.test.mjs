import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {createSupportedBridge} from '../cdp-supported-bridge.mjs';
test('foreign Miniflare Request reproduces old local500; fixed bridge preserves remote response provenance',async()=>{
  const script="export default {fetch(){return fetch('https://api.cdp.coinbase.com/platform/v2/x402/supported')}}";
  const options={workers:[{name:'boundary',modules:true,script,compatibilityDate:'2026-09-01',outboundService:request=>{
    assert.equal(request instanceof Request,false);
    // Exact failure in the old code, before any external network access.
    new Request(request);return new Response('unreachable');
  }}]};
  const mf=new Miniflare(convertV4MiniflareOptions(options));
  try{
    const old=await mf.dispatchFetch('https://local/check');assert.equal(old.status,500);
    assert.equal(old.headers.has('X-AICQ-Diagnostic-Source'),false);
    options.workers[0].outboundService=createSupportedBridge(async(url,init)=>{
      assert.equal(typeof url,'string');assert.doesNotThrow(()=>new Request(url,init));
      return new Response('mock remote body',{status:500});
    });
    await mf.setOptions(convertV4MiniflareOptions(options));
    const remote=await mf.dispatchFetch('https://local/check');
    assert.equal(remote.status,500);assert.equal(remote.headers.get('X-AICQ-Diagnostic-Source'),'remote_http');
    assert.equal(remote.headers.get('X-AICQ-Remote-Status'),'500');
    options.workers[0].outboundService=createSupportedBridge(async()=>{throw Error('PRIVATE_TRANSPORT_ERROR_MUST_NOT_LEAK');});
    await mf.setOptions(convertV4MiniflareOptions(options));
    const transport=await mf.dispatchFetch('https://local/check');
    assert.equal(transport.status,502);assert.equal(transport.headers.get('X-AICQ-Diagnostic-Source'),'local_transport');
    assert.equal(transport.headers.has('X-AICQ-Remote-Status'),false);assert.equal(await transport.text(),'');
  }finally{await mf.dispose();}
});
test('bridge rejects wrong endpoint without network and never follows redirects or trusts remote provenance headers',async()=>{
  let calls=0;const bridge=createSupportedBridge(async()=>{calls++;return new Response(null,{status:307,
    headers:{Location:'https://not-followed.invalid','X-AICQ-Diagnostic-Source':'spoof','X-AICQ-Remote-Status':'200'}});});
  assert.equal((await bridge(new Request('https://local/verify'))).headers.get('X-AICQ-Diagnostic-Source'),'local_policy');
  assert.equal(calls,0);
  const result=await bridge(new Request('https://api.cdp.coinbase.com/platform/v2/x402/supported'));
  assert.equal(calls,1);assert.equal(result.status,307);assert.equal(result.headers.get('X-AICQ-Diagnostic-Source'),'remote_http');
  assert.equal(result.headers.get('X-AICQ-Remote-Status'),'307');
});
