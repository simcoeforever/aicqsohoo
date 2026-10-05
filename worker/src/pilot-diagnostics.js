// Fixed diagnostic fields only. Never store exception text, JWT, keys, authorization,
// payer, nonce or provider response. This does not reconcile or retry a payment.
import {VerifyError,SettleError,FacilitatorResponseError,FacilitatorTimeoutError} from '@x402/core/types';
const stages=new Set(['client_setup','verify','settle']);
const kinds=new Set(['started','completed','verification_invalid','uncertain_response','sdk_exception','sdk_response_invalid','sdk_timeout','provider_rejected','local_setup_error']);
export function sanitizedPilotDiagnostic(stage,kind,errorOrResult){
  const result={stage:stages.has(stage)?stage:'client_setup',kind:kinds.has(kind)?kind:'sdk_exception'};
  if(errorOrResult instanceof FacilitatorTimeoutError)result.kind='sdk_timeout';
  else if(errorOrResult instanceof FacilitatorResponseError)result.kind='sdk_response_invalid';
  else if(errorOrResult instanceof VerifyError||errorOrResult instanceof SettleError){
    result.kind='provider_rejected';
    const status=errorOrResult.statusCode;if(Number.isInteger(status)&&status>=400&&status<=599)result.http_status=status;
  }
  if(result.stage==='settle'&&errorOrResult?.network==='eip155:8453'&&/^0x[0-9a-fA-F]{64}$/.test(errorOrResult?.transaction||'')){
    result.candidate_transaction=errorOrResult.transaction;result.candidate_network='eip155:8453';
    // A hash in an unsuccessful/error response is a read-only lookup candidate,
    // NEVER proof of settlement and never permission to submit again.
  }
  return result;
}
export function recordPilotDiagnostic(storage,id,diagnostic){
  try{
    storage.sql.exec('CREATE TABLE IF NOT EXISTS pilot_diagnostics (id TEXT PRIMARY KEY, diagnostic TEXT NOT NULL)');
    storage.sql.exec('INSERT OR REPLACE INTO pilot_diagnostics (id,diagnostic) VALUES (?,?)',id,JSON.stringify(diagnostic));
  }catch(_){/* Diagnostic failure cannot cause another provider request. */}
}
export function readPilotDiagnostic(storage,id){
  try{return JSON.parse(storage.sql.exec('SELECT diagnostic FROM pilot_diagnostics WHERE id=?',id).toArray()[0]?.diagnostic||'null')||undefined;}
  catch(_){return undefined;} // Historical receipts have no new diagnostic data.
}
