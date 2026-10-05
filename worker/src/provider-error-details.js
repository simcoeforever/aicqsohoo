// Fixed public enums from CDP OpenAPI snapshot 2026-10-05. No arbitrary text.
import allowlists from './provider-error-allowlist.json' with {type:'json'};
const verify=new Set(allowlists.verify),settle=new Set(allowlists.settle),codes=new Set(allowlists.code);
const messages=new Set(['Insufficient funds','Invalid signature','Invalid request','Self-send is not allowed','Self-send not allowed']);
export function safeProviderDetails(body,operation='verify'){
 const result={};if(!body||typeof body!=='object'||Array.isArray(body))return {provider_response_shape:'unrecognized'};
 result.provider_response_shape=typeof body.isValid==='boolean'?'x402_verify':typeof body.success==='boolean'?'x402_settle':typeof body.errorType==='string'?'cdp_error':'unrecognized';
 const reason=operation==='verify'?body.invalidReason:body.errorReason;
 if((operation==='verify'?verify:settle).has(reason))result.provider_reason=reason;
 else if(reason!=null)result.provider_reason_omitted=true;
 if(codes.has(body.errorType))result.provider_error_code=body.errorType;
 else if(body.errorType!=null)result.provider_error_code_omitted=true;
 const message=body.invalidMessage??body.errorMessage;
 if(messages.has(message))result.provider_message=message;
 else if(message!=null)result.provider_message_omitted=true;
 return result;
}
