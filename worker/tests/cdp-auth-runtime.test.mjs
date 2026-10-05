import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {importJWK,jwtVerify} from 'jose';
import {createSupportedBridge} from '../cdp-supported-bridge.mjs';
// Public RFC 8032 test vector 1; not an account/key issued by CDP, never sent externally.
const seed='9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const publicHex='d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const fixture=Buffer.from(seed+publicHex,'hex').toString('base64');
test('pinned CDP SDK Ed25519 JWT works in workerd; only authenticated supported GET, no payment',async()=>{
  const bundle=await build({entryPoints:[fileURLToPath(new URL('../auth-check-worker.js',import.meta.url))],bundle:true,
    write:false,format:'esm',platform:'browser',conditions:['workerd','worker','browser'],external:['node:*'],logLevel:'silent'});
  const pub=await importJWK({kty:'OKP',crv:'Ed25519',x:Buffer.from(publicHex,'hex').toString('base64url')},'EdDSA');
  let calls=0,rejectStatus=0;
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'local-auth',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',
    compatibilityFlags:['nodejs_compat'],bindings:{CDP_API_KEY_ID:'public-rfc-fixture-not-a-cdp-key',CDP_API_KEY_SECRET:fixture},
    outboundService:createSupportedBridge(async (url,init)=>{
      assert.equal(typeof url,'string');const request=new Request(url,init);
      calls++;assert.equal(request.method,'GET');assert.equal(request.url,'https://api.cdp.coinbase.com/platform/v2/x402/supported');
      if(rejectStatus===599)throw Error('PRIVATE_TRANSPORT_FIXTURE');
      assert.equal(request.body,null);assert.equal(request.headers.get('Accept'),'application/json');
      assert.equal(request.headers.get('Correlation-Context'),'sdkLanguage=typescript,source=cdp-sdk,sourceVersion=1.57.1');
      assert.equal(request.headers.has('X-Wallet-Auth'),false);
      const token=request.headers.get('Authorization').replace(/^Bearer /,'');
      const {payload,protectedHeader}=await jwtVerify(token,pub,{algorithms:['EdDSA']});
      assert.equal(protectedHeader.alg,'EdDSA');assert.equal(payload.sub,'public-rfc-fixture-not-a-cdp-key');
      assert.equal(protectedHeader.kid,'public-rfc-fixture-not-a-cdp-key');assert.equal(protectedHeader.typ,'JWT');
      assert.match(protectedHeader.nonce,/^[0-9a-f]{32}$/);assert.equal(payload.iss,'cdp');
      assert.equal('aud' in payload,false,'same default as official CDP facilitator SDK');
      assert.equal(payload.nbf,payload.iat);assert.ok(Math.abs(payload.iat-Math.floor(Date.now()/1000))<=3);
      assert.deepEqual(payload.uris,['GET api.cdp.coinbase.com/platform/v2/x402/supported']);assert.equal(payload.exp-payload.iat,120);
      return rejectStatus?Response.json({errorType:rejectStatus===500?'internal_server_error':'UNTRUSTED_CODE_'+fixture,
        errorMessage:'UNTRUSTED_PROVIDER_DETAIL_MUST_NOT_LEAK '+fixture,
        correlationId:rejectStatus===500?'41deb8d59a9dc9a7-IAD':'UNTRUSTED_ID_'+fixture},
        {status:rejectStatus,headers:{Location:'https://must-not-follow.invalid/'}}):Response.json({kinds:[{x402Version:2,scheme:'exact',network:'eip155:8453'}]});
    }) }]}));
  try{
    const result=await (await mf.dispatchFetch('https://local/check')).json();
    assert.equal(result.authenticated,true);assert.equal(result.base_exact_v2,true);assert.equal(result.payment_performed,false);
    assert.equal(result.billing_or_eligibility_confirmed,false);assert.equal(calls,1);
    for(const status of [401,403,307,500]){
      rejectStatus=status;const denied=await (await mf.dispatchFetch('https://local/check')).text();
      assert.equal(JSON.parse(denied).status,status);assert.equal(denied.includes('UNTRUSTED'),false);assert.equal(denied.includes(fixture),false);
      const diagnostic=JSON.parse(denied);assert.equal(diagnostic.payment_performed,false);
      if(status===500){assert.equal(diagnostic.authenticated,null);assert.equal(diagnostic.error_code,'internal_server_error');assert.equal(diagnostic.request_id,'41deb8d59a9dc9a7-IAD');}
      else{assert.equal('error_code' in diagnostic,false);assert.equal('request_id' in diagnostic,false);}
    }
    assert.equal(calls,5,'redirect is never followed; no verify/settle requests or automatic retry');
    rejectStatus=599;
    const transport=await (await mf.dispatchFetch('https://local/check')).json();
    assert.equal(transport.response_source,'local_transport');assert.equal('status' in transport,false);
    assert.equal(transport.payment_performed,false);
  }finally{await mf.dispose();}
});
