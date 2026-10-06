# MPP/Base product checkout: OFFLINE prototype, 2026-10-06

Production is unchanged. `product-payment-offline.js` is not imported by the Worker entrypoint/router. `MPP_ENABLED` and `PRODUCT_SALES_ENABLED` are false. The npm dependency is test-only. No new credential, signature, wallet action, facilitator request, payment, storage service or Worker deployment occurred.

Official references:
- https://mpp.dev/blog/evm-x402-support
- https://mpp.dev/llms-full.txt
- https://github.com/wevm/mppx
- https://registry.npmjs.org/mppx/0.13.1

Pinned `mppx` 0.13.1 and lockfile integrity. Reviewed published `dist/evm/server/Charge.js`, `dist/x402/server/EvmCharge.js`, `dist/evm/Types.js` and Credential/Challenge transport. The EVM method supports custom settlement and x402 facilitator interfaces. Its native authorization nonce is the challenge hash. The broad existing x402 wrapper also offers Tempo for compatible extension-free requirements; this prototype uses only `evm.charge` with explicit Base 8453, official USDC, six decimals, USD Coin/version 2 and an EIP-3009 exact requirement. Other methods, splits, unknown fields and x402 extensions are rejected.

The prototype normalizes actual SDK Payment Authorization headers and x402 Payment-Signature encoding into the same v2 payload. Synthetic orders bind product version, artifact hash, order resource, amount, receiver, expiration and challenge-derived nonce. Both formats use one synchronous in-memory claim before any await, and one injected existing HTTPFacilitatorClient-compatible verify/settle interface. It does not implement another transaction sender. Duplicate requests return stored state; uncertain settlement stays pending and never retries automatically. Retrieval returns receipt metadata for the immutable version/hash only and does not charge again.

`node --test worker/tests/product-payment-offline.test.mjs` passed four tests:
1. Actual pinned SDK challenge roundtrip, dual 402 headers and exact Base-only requirements; actual SDK rejects a zero-signature credential.
2. Both formats reject altered network/value/receiver/nonce, unknown extensions, expired/changed challenges and simultaneous credentials.
3. Ten concurrent mixed-format requests call mocked verification/settlement once; repeated retrieval and version/hash mismatch do not charge or grant another version.
4. Invalid verification, settlement exceptions and wrong settlement network never grant retrieval or trigger a second charge.

All credentials are deliberately invalid zero-signature fixtures; no signing operation occurs. Positive settlement is mocked. This is not cryptographic proof of a valid native MPP payment. Existing x402 cryptographic tests remain separate. The challenge ID uses an explicit `offline-` prefix, not a production secret/HMAC. The Map ledger is volatile, not multi-instance durable. There is no HTTP purchase route, download credential, private storage, paid file delivery, production reconciliation or MPP mainnet verification. A production adapter must integrate actual SDK validation, server-authenticated challenges, persistent atomic claims, the existing reviewed facilitator factory and private artifact entitlements before enabling anything. Never expose this harness as a purchase API.

Public product metadata remains draft, price/license/checkout null and sales disabled. Private package bytes are outside the public repository; neither they nor their complete matrix are built into Pages. Price, license, seller disclosure method and storage/delivery need decisions before sales. Personal details are not automatically published.
