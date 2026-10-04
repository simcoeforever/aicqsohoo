import test from 'node:test';import assert from 'node:assert/strict';
import {x402Client} from '@x402/core/client';import {ExactEvmScheme} from '@x402/evm/exact/client';
import {declarePaymentIdentifierExtension} from '@x402/extensions/payment-identifier';
import {requirements,RECEIVING_ADDRESS} from '../src/payment-core.js';
test('official browser SDK constructs only exact test USDC typed-data without RPC, ETH or approval',async()=>{
  const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};
  try{
    let signed;
    const signer={address:RECEIVING_ADDRESS,signTypedData:async message=>{signed=message;return '0x'+'b'.repeat(130);}};
    const client=new x402Client().register('eip155:84532',new ExactEvmScheme(signer));
    const challenge={x402Version:2,accepts:[requirements(RECEIVING_ADDRESS)],resource:{url:'https://aicqsohoo.com/contribution/test'},extensions:{'payment-identifier':declarePaymentIdentifierExtension(true)}};
    const payload=await client.createPaymentPayload(challenge);
    assert.equal(Number(signed.domain.chainId),84532);assert.equal(String(signed.message.value),'10000');
    assert.equal(signed.message.to.toLowerCase(),RECEIVING_ADDRESS.toLowerCase());
    assert.equal(signed.primaryType,'TransferWithAuthorization');
    assert.deepEqual(payload.accepted,challenge.accepts[0]);
    assert.ok(payload.extensions['payment-identifier']);
    assert.equal(payload.payload.authorization.from,RECEIVING_ADDRESS);
    assert.equal(payload.payload.authorization.to,RECEIVING_ADDRESS);
  }finally{globalThis.fetch=original;}
});
