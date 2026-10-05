# Owner-only generation 3

The separately approved additional attempt keeps Base 8453, Circle USDC
0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913, 10000 atomic and the same fixed
owner as both payer and recipient. General contributions stay disabled.

Generation 3 uses base-mainnet-pilot-v3, main3_ receipt IDs, mainnet-pilot-v3
terms, a new browser session key and fixed public nonce
0x5428ae33d87ac5565757f9888536c9db6aec036b1acd13027a520acfdea41f40.
Its signed validAfter is 1791177600 (2026-10-05T05:20:00Z). The previous
constants are preserved in owner-pilot-v2.js. Old fields/signatures/IDs/modes
cannot consume the new generation. There is one total start, permanently
stopped after success, failure or uncertainty; no reset or automatic retry.

Historical main_ GETs/v1-info still use the first DO; main2_ GETs/v2-info use
the second DO. Old contributions and diagnostics are read without modification.
Both consumed slots remain disabled. The new DO name does not migrate, delete
or rename the old instances. The SQLite binding/class/migrations stay unchanged.

Immediately before eth_signTypedData_v4, the browser rechecks chain/account,
reads balanceOf for the fixed owner on the fixed official token using Rabby's
read-only eth_call, requires a valid uint256 reply >=10000, and rechecks
chain/account again. Insufficient/malformed/failed reads stop before signature
and signed POST. It stores neither the balance nor its result and sends neither
to the site/analytics. A balance can subsequently change, so this is not a
settlement guarantee. Normal testnet behavior is preserved.

Content-hashed JavaScript and SRI remain mandatory; unknown/mixed page/client
generations fail closed. The new HTML requires chain-guard-v3 and owner-pilot-v3.
After Pages CI and Worker deployment, verify live hashed bytes/SRI, generation,
fresh supported-GET authentication and both historical receipts/caps. Use a
new release-query URL and close old payment tabs. The release operation performs
no owner connection, signature, payment/verify/settle POST or balance transfer.

The second receipt remains pending with verify/provider_rejected/HTTP400.
Its exact provider invalidReason is unavailable. The accompanying read-only
finality evidence verifies its fixed nonce unused/uncancelled and no owner
self-transfer across the bounded finalized interval via two public RPCs.
It preserves the fixed expiry upper 2026-10-05T04:39:38Z; actual validBefore
and creation timestamp were not retained. No successful transfer is observed;
this does not prove absence of reverted/pending transactions.
