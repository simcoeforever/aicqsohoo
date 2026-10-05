import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {pilotTerms} from '../worker/src/mainnet-pilot.js';
import {mainnetInformation} from '../worker/src/mainnet-preparation.js';
import {information,DEFAULT_CONFIG} from '../worker/src/payment-core.js';
const contractEvidence=JSON.parse(readFileSync(new URL('../worker/tests/fixtures/usdc-domains-onchain-2026-10-05.json',import.meta.url)));
const fixtureTerms=pilot=>{const c=contractEvidence.reports.find(r=>r.chainId===(pilot?8453:84532));return {scheme:'exact',network:'eip155:'+c.chainId,asset:c.address,amount:'10000',payTo:'0xF89FfB82f5F3dF83f68062a1b0d3BAA6A1005735',maxTimeoutSeconds:300,extra:{name:c.name,version:c.version}};};
const script=readFileSync(new URL('../static/payment-client.js',import.meta.url),'utf8');
const owner='0x15835b36659fA5c252A8Bd575527d6B20BC6575B';
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
async function browser(options={}){
 const pilot=options.pilot!==false,chain=pilot?'0x2105':'0x14a34';
 const events={},requests=[],wallet=[],typed=[],session=new Map();let chainReads=0,accountReads=0;
 session.set('aicqsohoo-owner-mainnet-v2-payment-id','main2_94fd3552-2209-43b7-bb10-d77f10063cbf');
 session.set('aicqsohoo-owner-mainnet-v2-payment-id-submitted','1');
 session.set('aicqsohoo-owner-mainnet-v3-payment-id','main3_3fbf09a5-b5ff-433b-94df-929dbaed05b4');session.set('aicqsohoo-owner-mainnet-v3-payment-id-submitted','1');
 const button={disabled:true,dataset:{paymentMode:options.mode??(pilot?'owner-pilot-v5':'testnet')},addEventListener:(name,fn)=>events[name]=fn};
 const consent={checked:false,addEventListener:()=>{}},status={textContent:'',append:()=>{}};
 const nodes={'test-payment':button,'payment-consent':consent,'payment-status':status};
 const provider={isRabby:true,request:async args=>{
  wallet.push(args.method);
  if(args.method==='eth_requestAccounts')return [owner];
  if(args.method==='eth_accounts')return [(++accountReads>=2&&options.accountChangedAfterBalance)||options.accountChanged?'0x'+'1'.repeat(40):owner];
  if(args.method==='eth_chainId')return (++chainReads>=3&&options.chainChanged)||(chainReads>=4&&options.chainChangedAfterBalance)?'0x14a34':chain;
  if(args.method==='eth_call'){
   if(args.params[0].data==='0x3644e515'){if(options.domainError)throw Error('PUBLIC_FIXTURE_ERROR');return options.domainRaw??contractEvidence.reports.find(r=>r.chainId===8453).domain_separator;}
   assert.deepEqual(JSON.parse(JSON.stringify(args.params)),[{to:fixtureTerms(true).asset,data:'0x70a08231'+owner.slice(2).toLowerCase().padStart(64,'0')},'latest']);
   if(options.balanceError)throw Error('PRIVATE_RPC_ERROR');
   return options.balanceRaw??('0x'+BigInt(options.balance??10000).toString(16).padStart(64,'0'));
  }
  if(args.method==='eth_signTypedData_v4'){typed.push(JSON.parse(args.params[1]));return '0x'+'b'.repeat(130);}
  throw Error('unexpected wallet call: '+args.method);
 }};
 const context={console,URL,Event,TextEncoder,TextDecoder,Uint8Array,crypto:webcrypto,setTimeout,clearTimeout,
  btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
  location:{pathname:options.path??(pilot?'/contribute/self-test/':'/contribute/'),href:'https://aicqsohoo.com/'},
  sessionStorage:{getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,v)},
  document:{documentElement:{lang:'en'},currentScript:{dataset:{paymentClient:options.marker??'chain-guard-v5'},src:options.src??'https://aicqsohoo.com/payment-client.'+'a'.repeat(64)+'.js'},
   getElementById:id=>nodes[id],querySelectorAll:selector=>nodes[selector.slice(1)]?[nodes[selector.slice(1)]]:[],createElement:()=>({})},
  window:{ethereum:provider,addEventListener:()=>{},dispatchEvent:()=>{}},
  fetch:async(url,opts={})=>{
   requests.push({url,opts});
   if(url.endsWith('/info'))return {json:async()=>options.info??(pilot?mainnetInformation(true):information({...DEFAULT_CONFIG,mode:'testnet'}))};
   const id=JSON.parse(opts.body).id;
   if(!opts.headers['PAYMENT-SIGNATURE'])return {status:402,json:async()=>({x402Version:2,accepts:[options.terms??fixtureTerms(pilot)],resource:{url:'https://aicqsohoo.com'+url},extensions:{'payment-identifier':{info:{required:true},schema:{type:'object'}}}})};
   return {status:200,json:async()=>({id,state:'settled',network:options.receiptNetwork??(pilot?'eip155:8453':'eip155:84532'),transaction:'0x'+'a'.repeat(64)})};
  }};
 let startupError;try{vm.runInNewContext(script,context);}catch(error){startupError=error;}
 await flush();consent.checked=true;const click=async()=>{if(events.click)await events.click();await flush();};
 return {button,status,requests,wallet,typed,context,startupError,click,session};
}
test('bundled client preserves distinct mainnet generation and testnet signing/routes',async()=>{
 for(const pilot of [true,false]){
  const b=await browser({pilot});assert.equal(b.startupError,undefined);await b.click();
  assert.equal(b.typed[0].domain.name,pilot?'USD Coin':'USDC');assert.equal(b.typed[0].domain.version,'2');assert.equal(Number(b.typed[0].domain.chainId),pilot?8453:84532);
  assert.equal(b.session.get('aicqsohoo-owner-mainnet-v2-payment-id-submitted'),'1');assert.equal(b.session.get('aicqsohoo-owner-mainnet-v3-payment-id-submitted'),'1');
  if(pilot)assert.match(b.session.get('aicqsohoo-owner-mainnet-v5-payment-id'),/^main5_/);
  assert.equal(b.typed.length,1);assert.equal(Number(b.typed[0].domain.chainId),pilot?8453:84532);
  assert.equal(b.requests.length,3);assert.equal(b.requests[1].url,pilot?'/contribution/mainnet/self-test':'/contribution/test');
  const payload=JSON.parse(Buffer.from(b.requests[2].opts.headers['PAYMENT-SIGNATURE'],'base64').toString());
  assert.equal(payload.accepted.network,pilot?'eip155:8453':'eip155:84532');
  if(pilot){assert.equal(b.typed[0].message.validAfter,mainnetInformation(true).authorization_valid_after);assert.equal(payload.payload.authorization.nonce,mainnetInformation(true).authorization_nonce);}
  assert.match(b.status.textContent,/settled/);
 }
});
test('mixed generation, missing/unknown mode, wrong page and unversioned scripts fail before any request',async()=>{
 for(const options of [{mode:'owner-pilot'},{mode:'owner-pilot-v2'},{mode:''},{mode:'testnet'},{mode:'unknown'},{path:'/about/'},{marker:'chain-guard-v2'},{marker:'old'},{src:'https://aicqsohoo.com/payment-client.js'}]){
  const b=await browser(options);assert.match(b.startupError?.message??'',/payment_page_version_mismatch/);
  await b.click();assert.equal(b.button.disabled,true);assert.equal(b.requests.length,0);assert.equal(b.wallet.length,0);
 }
});
test('wrong info chain, asset or generation cannot enable the owner page',async()=>{
 for(const change of [{network:'eip155:84532'},{asset:'0x036CbD53842c5426634e7929541eC2318f3dCF7e'},{generation:1},{generation:2},{pre_sign_balance_check:false},{terms_version:'mainnet-pilot-v1'}]){
  const b=await browser({info:{...mainnetInformation(true),...change}});await b.click();assert.equal(b.typed.length,0);assert.equal(b.requests.length,1);assert.equal(b.wallet.length,0);
 }
});
test('wrong challenge chain or asset stops before wallet access',async()=>{
 for(const change of [{network:'eip155:84532'},{asset:'0x036CbD53842c5426634e7929541eC2318f3dCF7e'}]){
  const b=await browser({terms:{...pilotTerms(),...change}});await b.click();assert.equal(b.requests.length,2);assert.equal(b.wallet.length,0);
 }
});
test('wallet chain/account changes between connection and signing stop before signature',async()=>{
 for(const options of [{chainChanged:true},{accountChanged:true},{chainChangedAfterBalance:true},{accountChangedAfterBalance:true}]){
  const b=await browser(options);await b.click();assert.equal(b.typed.length,0);assert.equal(b.requests.length,2);
  assert.match(b.status.textContent,/Stopped before submission/);
 }
});
test('owner balance 0/9999, malformed/failed reads stop before signature; 10000/10001 sign once',async()=>{
 for(const options of [{balance:0},{balance:9999},{balanceRaw:'0x1'},{balanceRaw:'0x'+'z'.repeat(64)},{balanceError:true},{balance:10000},{balance:10001}]){
  const b=await browser(options);await b.click();const enough=options.balance>=10000;
  assert.equal(b.typed.length,enough?1:0);assert.equal(b.requests.length,enough?3:2);
  assert.equal(b.requests.some(r=>JSON.stringify(r.opts.body??'').includes('balance')),false);
  assert.equal([...b.session.keys()].some(k=>k.includes('balance')),false);
  if(!enough)assert.match(b.status.textContent,/Stopped:/);
 }
});
test('HTML mode mutation after info cannot change chain or submit',async()=>{
 const b=await browser();b.button.dataset.paymentMode='testnet';await b.click();assert.equal(b.wallet.length,0);assert.equal(b.requests.length,1);
});
test('receipt for a different chain is never described as successful mainnet payment',async()=>{
 const b=await browser({receiptNetwork:'eip155:84532'});await b.click();assert.equal(b.typed.length,1);
 assert.match(b.status.textContent,/Outcome unknown/);assert.equal(b.button.disabled,true);await b.click();assert.equal(b.typed.length,1);
});

test('independent old mainnet USDC domain challenge stops before wallet access',async()=>{const b=await browser({terms:{...pilotTerms(),extra:{name:'USDC',version:'2'}}});await b.click();assert.equal(b.wallet.length,0);assert.equal(b.typed.length,0);assert.equal(b.requests.filter(r=>r.opts.headers?.['PAYMENT-SIGNATURE']).length,0);});

test('actual contract separator mismatch, malformed or failed read stops before signing/submitting',async()=>{for(const options of [{domainRaw:'0x'+'00'.repeat(32)},{domainRaw:'malformed'},{domainError:true}]){const b=await browser(options);await b.click();assert.equal(b.typed.length,0);assert.equal(b.wallet.includes('eth_signTypedData_v4'),false);assert.equal(b.requests.filter(r=>r.opts.headers?.['PAYMENT-SIGNATURE']).length,0);assert.match(b.status.textContent,/signing domain/);}});
