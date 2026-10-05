import test from 'node:test';import assert from 'node:assert/strict';import {checkMainnetReadOnly} from '../reconcile-mainnet-readonly.mjs';
const from=0x31c490f,end=from+4001,hash='0x'+'a'.repeat(64),toHex=n=>'0x'+n.toString(16);
function fixture(finalizedUtc='2026-10-05T01:54:00Z'){
 const ranges=[],methods=[];
 const fetcher=async(url,init)=>{
  if(init.method==='GET'){assert.ok(url.startsWith('https://aicqsohoo.com/contribution/mainnet/receipt/'));return Response.json({id:'main_9d4c79f8-a02f-4295-87ed-0b6def604b9b',state:'pending',retry_payment:false},{status:202});}
  assert.equal(url,'https://mainnet.base.org');const {method,params}=JSON.parse(init.body);methods.push(method);
  if(method==='eth_chainId')return Response.json({result:'0x2105'});
  if(method==='eth_getBlockByNumber'){
   const first=params[0]===toHex(from);return Response.json({result:{number:toHex(first?from:end),hash,timestamp:toHex(Date.parse(first?'2026-10-05T00:27:45Z':finalizedUtc)/1000)}});
  }
  assert.equal(method,'eth_getLogs');ranges.push(params[0]);return Response.json({result:[]});
 };
 return {fetcher,ranges,methods};
}
test('read-only scan covers inclusive chunks without gaps and waits for finalized expiry bound; no state or payment calls',async()=>{
 const f=fixture(),r=await checkMainnetReadOnly(f.fetcher);assert.equal(r.no_successful_self_transfer_in_entire_bounded_window,true);assert.equal(r.nonce_state_checked,false);assert.equal(r.receipt_or_slot_changed,false);
 assert.deepEqual(f.ranges.map(x=>[Number(BigInt(x.fromBlock)),Number(BigInt(x.toBlock))]),[[from,from+1999],[from+2000,from+3999],[from+4000,end]]);
 assert.ok(f.methods.every(m=>['eth_chainId','eth_getBlockByNumber','eth_getLogs'].includes(m)));
 const early=await checkMainnetReadOnly(fixture('2026-10-05T01:53:25Z').fetcher);assert.equal(early.finalized_covers_expiry_upper,false);assert.equal(early.no_successful_self_transfer_in_entire_bounded_window,false);
});
