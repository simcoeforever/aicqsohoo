// One read-only check; no signing, payment/verify/settle, ledger writes or retry.
import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';
const rpcUrl='https://mainnet.base.org',receiptId='main_9d4c79f8-a02f-4295-87ed-0b6def604b9b';
const token='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',ownerTopic='0x000000000000000000000000f89ffb82f5f3df83f68062a1b0d3baa6a1005735';
const transferTopic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const fromBlock=0x31c490f,publicationEpoch=Date.parse('2026-10-05T01:19:58.944034Z')/1000;
const expiryUpperEpoch=Date.parse('2026-10-05T01:53:26Z')/1000;
const integer=value=>{if(!/^0x[0-9a-f]+$/i.test(value||''))throw Error('Invalid public RPC integer');const n=Number(BigInt(value));if(!Number.isSafeInteger(n))throw Error('RPC integer bounds');return n;};
export async function checkMainnetReadOnly(fetcher=fetch){
 const rpc=async(method,params)=>{
  if(!['eth_chainId','eth_getBlockByNumber','eth_getLogs'].includes(method))throw Error('Read-only RPC allowlist');
  const response=await fetcher(rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(20000),body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  if(!response.ok)throw Error('Public RPC HTTP failure');const data=await response.json();if(data.error||data.result===undefined||data.result===null)throw Error('Public RPC response failure');return data.result;
 };
 if(await rpc('eth_chainId',[])!=='0x2105')throw Error('Wrong chain');
 const end=await rpc('eth_getBlockByNumber',['finalized',false]),start=await rpc('eth_getBlockByNumber',['0x'+fromBlock.toString(16),false]);
 const endNumber=integer(end.number),startTime=integer(start.timestamp),endTime=integer(end.timestamp);
 if(integer(start.number)!==fromBlock||endNumber<fromBlock||startTime>publicationEpoch)throw Error('Incomplete initial observation range');
 const ranges=[],transfers=[];
 for(let cursor=fromBlock;cursor<=endNumber;){
  const last=Math.min(cursor+1999,endNumber),filter={address:token,fromBlock:'0x'+cursor.toString(16),toBlock:'0x'+last.toString(16),topics:[transferTopic,ownerTopic,ownerTopic]};
  const logs=await rpc('eth_getLogs',[filter]);if(!Array.isArray(logs))throw Error('Invalid logs response');
  for(const log of logs){
   if(log.removed===true||log.address?.toLowerCase()!==token||log.topics?.length!==3||log.topics.some((t,i)=>t.toLowerCase()!==filter.topics[i])||!/^0x[0-9a-f]{64}$/i.test(log.transactionHash||'')||!/^0x[0-9a-f]{64}$/i.test(log.data||''))throw Error('Unexpected filtered log');
   const block=integer(log.blockNumber);if(block<cursor||block>last)throw Error('Log outside requested range');
   transfers.push({transaction:log.transactionHash,block,amount_atomic:BigInt(log.data).toString()});
  }
  ranges.push({from:cursor,to:last,count:logs.length});cursor=last+1;
 }
 // Pin the scanned finalized endpoint; do not silently accept a changed chain.
 const pinned=await rpc('eth_getBlockByNumber',[end.number,false]);if(pinned.hash!==end.hash)throw Error('Scanned finalized endpoint changed');
 const receiptResponse=await fetcher('https://aicqsohoo.com/contribution/mainnet/receipt/'+receiptId,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(![200,202,422].includes(receiptResponse.status))throw Error('Receipt GET failed');const receipt=await receiptResponse.json();
 if(receipt.id!==receiptId)throw Error('Wrong receipt');
 const finalizedCoversExpiry=endTime>=expiryUpperEpoch,matching=transfers.filter(t=>t.amount_atomic==='10000');
 return {receipt_id:receiptId,receipt_state:receipt.state,chain:'eip155:8453',token,
  publication_created_at:'2026-10-05T01:19:58.944034Z',pending_observed_http_date:'2026-10-05T01:48:26Z',
  conservative_expiry_upper_utc:'2026-10-05T01:53:26Z',start_block:fromBlock,start_utc:new Date(startTime*1000).toISOString(),
  finalized_block:endNumber,finalized_hash:end.hash,finalized_utc:new Date(endTime*1000).toISOString(),
  contiguous_ranges:ranges,all_owner_self_transfer_count:transfers.length,matching_10000_count:matching.length,transfers,
  finalized_covers_expiry_upper:finalizedCoversExpiry,
  no_successful_self_transfer_in_entire_bounded_window:finalizedCoversExpiry&&transfers.length===0,
  nonce_state_checked:false,receipt_or_slot_changed:false,payment_performed:false,
  limitation:'Expiry bound assumes the published server clock and observed HTTP Date share normal UTC; applies to the owner flow accepted by that version. No nonce-specific or reverted-transaction proof.'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{console.log(JSON.stringify(await checkMainnetReadOnly(),null,2));}catch(_){console.error('Read-only reconciliation incomplete; no state was changed.');process.exitCode=1;}
}
