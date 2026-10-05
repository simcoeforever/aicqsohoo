import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {VerifyError,SettleError,FacilitatorResponseError,FacilitatorTimeoutError} from '@x402/core/types';
import {sanitizedPilotDiagnostic,recordPilotDiagnostic,readPilotDiagnostic} from '../src/pilot-diagnostics.js';
import {pilotReceipt,handlePilot} from '../src/mainnet-pilot.js';import {MainnetPreparationService} from '../src/mainnet-preparation.js';import {Ledger} from '../src/payment-core.js';
const hash='0x'+'a'.repeat(64),id='main_'+'b'.repeat(32);
test('diagnostics store only fixed stage/kind, typed HTTP status and chain-checked candidate hash; never error text or provider fields',()=>{
 const e=new SettleError(500,{errorReason:'PRIVATE',errorMessage:'JWT SECRET AUTHORIZATION NONCE PAYER',transaction:hash,network:'eip155:8453',payer:'PRIVATE'});
 assert.deepEqual(sanitizedPilotDiagnostic('settle','sdk_exception',e),{stage:'settle',kind:'provider_rejected',http_status:500,upstream_http_status:500,status_source:'sdk_http_response',provider_error_class:'SettleError',provider_response_shape:'x402_settle',provider_reason_omitted:true,provider_message_omitted:true,candidate_transaction:hash,candidate_network:'eip155:8453'});
 assert.deepEqual(sanitizedPilotDiagnostic('verify','sdk_exception',new VerifyError(403,{invalidReason:'PRIVATE',invalidMessage:'PRIVATE'})),{stage:'verify',kind:'provider_rejected',http_status:403,upstream_http_status:403,status_source:'sdk_http_response',provider_error_class:'VerifyError',provider_response_shape:'x402_verify',provider_reason_omitted:true,provider_message_omitted:true});
 assert.equal(sanitizedPilotDiagnostic('verify','sdk_exception',new FacilitatorResponseError('PRIVATE')).kind,'sdk_response_invalid');
 assert.equal(sanitizedPilotDiagnostic('settle','sdk_exception',new FacilitatorTimeoutError('settle',90000)).kind,'sdk_timeout');
 const spoof={name:'SettleError',statusCode:500,message:'PRIVATE',transaction:hash,network:'eip155:84532'};
 assert.deepEqual(sanitizedPilotDiagnostic('verify','sdk_exception',spoof),{stage:'verify',kind:'sdk_exception'});
 assert.deepEqual(sanitizedPilotDiagnostic('PRIVATE','PRIVATE',spoof),{stage:'client_setup',kind:'sdk_exception'});
});
test('reading a historical pending receipt neither creates diagnostics nor changes receipt/state/cap',async()=>{
 const db=new DatabaseSync(':memory:'),storage={sql:{exec(q,...args){const rows=db.prepare(q).all(...args);return {toArray:()=>rows};}},transactionSync(fn){return fn();}},ledger=new Ledger(storage,{daily:1,total:1});
 ledger.create(id,'existing-fixed-terms','2026-10-05');ledger.state(id,'pending');
 const before=JSON.stringify(ledger.row(id));assert.equal(readPilotDiagnostic(storage,id),undefined);
 const receipt=await new MainnetPreparationService({storage}).fetch(new Request('https://local/contribution/mainnet/receipt/'+id));
 assert.deepEqual(await receipt.json(),{id,state:'pending',retry_payment:false});assert.equal(JSON.stringify(ledger.row(id)),before);
 assert.equal(storage.sql.exec("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='pilot_diagnostics'").toArray()[0].n,0);
 recordPilotDiagnostic(storage,'main_'+'c'.repeat(32),sanitizedPilotDiagnostic('settle','uncertain_response',{network:'eip155:8453',transaction:hash,message:'PRIVATE'}));
 assert.equal(readPilotDiagnostic(storage,id),undefined);assert.equal(JSON.stringify(ledger.row(id)),before);
 assert.equal(ledger.create('main_'+'d'.repeat(32),'terms','2026-10-06').error,429);
});
