// Isolated owner-only pilot; general contributions remain disabled.
import {Ledger,RECEIVING_ADDRESS} from './payment-core.js';
import {checkCdpAuthentication} from './cdp-auth.js';
import {createSupportedBridge} from '../cdp-supported-bridge.mjs';
import {handlePilot,cdpPilotClient} from './mainnet-pilot.js';
const AUTH_CHECK_VERSION='prep-auth-2026-10-05-v1';
export const MAINNET_PROFILE=Object.freeze({
  network:'eip155:8453',asset:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  amount_atomic:'10000',recipient:RECEIVING_ADDRESS,scheme:'exact',max_timeout_seconds:300,
  terms_version:'mainnet-pilot-v1',daily_cap:1,total_cap:1,
  receipt_prefix:'main_',ledger_name:'base-mainnet-pilot-v1',
});
export function mainnetInformation(enabled=false){return {
  ...MAINNET_PROFILE,enabled,payment_mode:enabled?'owner-pilot':'off',preparation_only:!enabled,
  owner_only:true,payer:RECEIVING_ADDRESS,self_transfer:true,general_contributions_enabled:false,
  amount_display:'0.01 USDC (real funds)',existing_content_free:true,
  stop_on_success_or_unknown:true,automatic_retry:false,
  blockers:['eligibility_and_use_confirmation','billing_confirmation'],
};}
export class MainnetPreparationService {
  constructor(ctx,env={},check=checkCdpAuthentication){
    this.ctx=ctx;this.env=env;this.check=check;this.ledger=new Ledger(ctx.storage,{daily:1,total:1});this.authPromise=null;
  }
  authStatus(){
    if(!this.authPromise)this.authPromise=this.ctx.blockConcurrencyWhile(async()=>{
      const key=AUTH_CHECK_VERSION;
      const existing=await this.ctx.storage.get(key);if(existing)return existing;
      const reserved={check_version:key,authenticated:null,check_state:'started',payment_performed:false,automatic_retry:false};
      await this.ctx.storage.put(key,reserved); // A crash never creates another remote call.
      const bridge=createSupportedBridge();
      const result=await this.check({apiKeyId:this.env.CDP_API_KEY_ID,apiKeySecret:this.env.CDP_API_KEY_SECRET},
        (url,init)=>bridge(new Request(url,init)));
      const safe={check_version:key,check_state:'completed',checked_at:new Date().toISOString(),
        authenticated:result.authenticated===true?true:result.authenticated===false?false:null,
        response_source:result.response_source,payment_performed:false,automatic_retry:false,
        base_exact_v2:result.base_exact_v2===true,billing_or_eligibility_confirmed:false};
      if(Number.isInteger(result.status))safe.status=result.status;
      await this.ctx.storage.put(key,safe);return safe;
    });
    return this.authPromise;
  }
  async fetch(request){
    const path=new URL(request.url).pathname;
    if(request.method==='GET'&&path==='/contribution/mainnet/auth-status')
      return Response.json(await this.authStatus(),{headers:{'Cache-Control':'no-store'}});
    const mode=this.env.MAINNET_PAYMENT_MODE==='owner-pilot'?'owner-pilot':'off';
    if(request.method==='GET'&&path==='/contribution/mainnet/info'){
      const unused=this.ctx.storage.sql.exec('SELECT COUNT(*) AS n FROM contributions').toArray()[0].n===0;
      return Response.json(mainnetInformation(mode==='owner-pilot'&&unused),{headers:{'Cache-Control':'no-store'}});
    }
    return handlePilot(request,{mode,ledger:this.ledger,client:()=>cdpPilotClient(this.env)});
  }
}
