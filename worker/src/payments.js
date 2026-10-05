import {HTTPFacilitatorClient} from '@x402/core/server';
import {DEFAULT_CONFIG,FACILITATOR,NETWORK,Ledger,handle,information} from './payment-core.js';
import {MAINNET_PROFILE} from './mainnet-preparation.js';
const client=new HTTPFacilitatorClient({url:FACILITATOR,timeoutMs:20000});
let supportedPromise=null,checked=0;
async function supported(){
  if(!supportedPromise||Date.now()-checked>300000){checked=Date.now();supportedPromise=client.getSupported().then(info=>{
    if(!info.kinds?.some(kind=>kind.x402Version===2&&kind.scheme==='exact'&&kind.network===NETWORK))throw Error('unsupported');
    return true;
  }).catch(()=>{supportedPromise=null;return false;});}
  return supportedPromise;
}
export class PaymentService {
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.ledger=new Ledger(ctx.storage);}
  async fetch(request){
    const config={...DEFAULT_CONFIG,mode:this.env.PAYMENT_MODE==='testnet'?'testnet':'off'};
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/contribution/info')return Response.json({...information(config),daily_cap:5,total_cap:20,retention:'At most 20 records, retained through this experiment; no reset or deletion permits replay.',payer_gas:'EIP-3009 facilitator normally pays settlement gas; no payer ETH or token approval is requested.'},{headers:{'Cache-Control':'no-store'}});
    // No supported/verify/settle calls while off. Free existing receipts still work.
    if(config.mode==='testnet'&&request.method==='POST'&&!(await supported()))return Response.json({error:'testnet_facilitator_unavailable',retry_payment:false},{status:503,headers:{'Cache-Control':'no-store'}});
    const response=await handle(request,{config,ledger:this.ledger,facilitator:client});
    return response;
  }
}
const origins=new Set(['https://aicqsohoo.com','https://www.aicqsohoo.com']);
export async function paymentRoute(request,env){
  const origin=request.headers.get('Origin');
  const headers={'Vary':'Origin','Cache-Control':'no-store'};
  if(origin&&origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
  headers['Access-Control-Expose-Headers']='PAYMENT-REQUIRED, PAYMENT-RESPONSE';
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST','Access-Control-Allow-Headers':'Content-Type, PAYMENT-SIGNATURE'}});
  if(request.method==='POST'&&origin&&!origins.has(origin))return Response.json({error:'origin_not_allowed'},{status:403,headers});
  if(request.method==='POST'&&!request.headers.get('Content-Type')?.startsWith('application/json'))return Response.json({error:'json_required'},{status:400,headers});
  const path=new URL(request.url).pathname;
  const mainnet=path==='/contribution/mainnet'||path.startsWith('/contribution/mainnet/');
  const binding=mainnet?env.MAINNET_PAYMENTS:env.PAYMENTS;
  if(!binding)return Response.json({enabled:false,error:'payments_disabled'},{status:503,headers});
  try{
    const response=await binding.get(binding.idFromName(mainnet?MAINNET_PROFILE.ledger_name:'base-sepolia-test-v1')).fetch(request);
    const result=new Response(response.body,response);for(const [name,value]of Object.entries(headers))result.headers.set(name,value);return result;
  }catch(_){return Response.json({error:'payment_state_unavailable',retry_payment:false},{status:503,headers});}
}
