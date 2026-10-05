// Read-only authentication adapter. Deliberately exposes no verify/settle method.
import {generateJwt} from '@coinbase/cdp-sdk/auth';
export const CDP_SUPPORTED_URL='https://api.cdp.coinbase.com/platform/v2/x402/supported';
const ERROR_CODES=new Set(['internal_server_error','bad_gateway','service_unavailable',
  'unauthorized','forbidden','invalid_request','invalid_argument','rate_limit_exceeded',
  'too_many_requests','payment_method_required','payment_required']);
async function safeDiagnostic(response,privateValues){
  // Never return provider messages, arbitrary fields, links, headers or raw bodies.
  let body={};
  try {
    const reader=response.body?.getReader();let size=0;const chunks=[];
    if(reader){while(true){const {done,value}=await reader.read();if(done)break;
      size+=value.length;if(size>8192){await reader.cancel();throw Error('bounded');}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      body=JSON.parse(new TextDecoder().decode(bytes));}
  }catch(_){/* No raw fallback. */}
  const diagnostics={};
  if(ERROR_CODES.has(body?.errorType))diagnostics.error_code=body.errorType;
  const candidates=[body?.correlationId,body?.requestId,response.headers.get('x-request-id'),response.headers.get('cf-ray')];
  for(const value of candidates){
    if(typeof value!=='string'||privateValues.some(secret=>secret&&value.includes(secret)))continue;
    // UUID, hex trace ID, or documented Cloudflare ray/correlation ID shape only.
    if(/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,32}(?:-[A-Z]{3})?)$/i.test(value)){
      diagnostics.request_id=value;break;
    }
  }
  return diagnostics;
}
export async function checkCdpAuthentication({apiKeyId,apiKeySecret},fetcher=fetch){
  if(!apiKeyId||!apiKeySecret)return {authenticated:null,error:'credentials_missing',payment_performed:false};
  if(typeof apiKeyId!=='string'||apiKeyId!==apiKeyId.trim()||/[\r\n]/.test(apiKeyId)||
     typeof apiKeySecret!=='string'||! /^[A-Za-z0-9+/]{86}==$/.test(apiKeySecret))
    return {authenticated:null,response_source:'local_input',error:'expected_single_line_ed25519_base64_64_bytes',payment_performed:false};
  try {
    const token=await generateJwt({apiKeyId,apiKeySecret,requestMethod:'GET',
      requestHost:'api.cdp.coinbase.com',requestPath:'/platform/v2/x402/supported',expiresIn:120});
    const response=await fetcher(CDP_SUPPORTED_URL,{method:'GET',redirect:'manual',
      headers:{Authorization:`Bearer ${token}`,Accept:'application/json',
        'Correlation-Context':'sdkLanguage=typescript,source=cdp-sdk,sourceVersion=1.57.1'},signal:AbortSignal.timeout(20000)});
    const source=response.headers.get('X-AICQ-Diagnostic-Source');
    if(source!=='remote_http'||response.headers.get('X-AICQ-Remote-Status')!==String(response.status))
      return {authenticated:null,response_source:source==='local_transport'?'local_transport':source==='local_policy'?'local_policy':'local_bridge_unverified',
        error:'local_check_failed_no_verified_remote_response',payment_performed:false,automatic_retry:false};
    if(!response.ok)return {authenticated:response.status===401?false:null,status:response.status,
      response_source:'remote_http',
      error:response.status>=500?'service_error_authentication_unconfirmed':'request_rejected_authentication_unconfirmed',
      ...await safeDiagnostic(response,[apiKeyId,apiKeySecret,token]),payment_performed:false,
      automatic_retry:false,billing_or_eligibility_confirmed:false};
    const body=await response.json();
    return {authenticated:true,status:response.status,response_source:'remote_http',
      base_exact_v2:!!body.kinds?.some(k=>k.x402Version===2&&k.scheme==='exact'&&k.network==='eip155:8453'),
      payment_performed:false,billing_or_eligibility_confirmed:false};
  }catch(_){return {authenticated:null,response_source:'local_auth_or_runtime',error:'authentication_check_failed',payment_performed:false};}
}
