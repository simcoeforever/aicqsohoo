import test from 'node:test';
import assert from 'node:assert/strict';
import {checkCdpAuthentication} from '../src/cdp-auth.js';
const fixture=Buffer.from('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a','hex').toString('base64');
test('hidden-input formatting faults stop locally without remote request or fabricated HTTP500',async()=>{
  let calls=0;const fetcher=()=>{calls++;throw Error('MUST_NOT_CALL');};
  for(const secret of ['',fixture+'\n',' '+fixture,'"'+fixture+'"','not-base64',fixture.slice(0,-1)]){
    const result=await checkCdpAuthentication({apiKeyId:'fixture',apiKeySecret:secret},fetcher);
    assert.equal(result.authenticated,null);assert.equal('status' in result,false);assert.equal(result.payment_performed,false);
  }
  assert.equal(calls,0);
});
test('SDK/fetch exceptions and unmarked synthetic500 are classified locally, not as a verified remote500',async()=>{
  const opts={apiKeyId:'public-fixture',apiKeySecret:fixture};
  const failure=await checkCdpAuthentication(opts,()=>{throw Error('PRIVATE_EXCEPTION');});
  assert.equal(failure.response_source,'local_auth_or_runtime');assert.equal('status' in failure,false);
  const synthetic=await checkCdpAuthentication(opts,async()=>new Response(null,{status:500}));
  assert.equal(synthetic.response_source,'local_bridge_unverified');assert.equal('status' in synthetic,false);
});
