# Local mainnet SDK boundary audit — 2026-10-05

No real authorization, nonce, wallet key, CDP secret or JWT was collected. No real
verify/settle request, payment, deployment, receipt mutation or capacity reset occurred.

The owner submitted receipt `main_9d4c79f8-a02f-4295-87ed-0b6def604b9b` using
published commit `5075ad349bde93a9f52b29acce30519fcdd990ec`. Its public receipt
remained pending without a transaction hash. Public Base8453 RPC logs for official
USDC, owner-to-same-owner, were empty from 00:27:45 to 01:34:23 UTC. This is a
bounded observation, not proof of every provider outcome. Secret metadata retained
both CDP binding names; secret values were never read. The user also reported no
settlements in the CDP Metrics screen; delay remains possible.

## Reproduced implementation defect

The pinned `@coinbase/cdp-sdk@1.57.1` `/x402` aggregate export under the Worker
bundle leaves the JWT random initializer uncalled. `createCdpFacilitatorClient`
then throws `TypeError: getRandomValues is not a function` while generating its
authorization headers, before the first verify HTTP request. This was reproduced
with the original Wrangler-generated bundle in workerd, a fabricated browser
signature and a public RFC8032 key vector; mock provider request count was zero.
The earlier isolated `/auth` GET test did not exercise this aggregate-export path.
The original catch discarded the exception and recorded pending, hiding the cause.
That is an implementation/test gap; there is no evidence of a CDP HTTP500 here.

The current deployed receipt lacks diagnostic provenance. The reproduction proves
the code defect and its pre-network failure path; it does not manufacture a historical
provider log for that particular request. Existing records remain untouched.

## Local correction and exact API audit

The local correction uses the SDK's official public `/auth` `generateJwt` entrypoint
and `@x402/core@2.28.0` `HTTPFacilitatorClient`, matching the pinned facilitator
adapter's URL, per-operation JWT URI claims, 120-second JWT lifetime, EdDSA/key ID,
Authorization and Correlation-Context headers. It retains SDK versions and avoids
the aggregate import graph. No wallet secret or additional permission is needed.

The official client sends JSON POSTs to
`https://api.cdp.coinbase.com/platform/v2/x402/verify` and `/settle`, each with
`x402Version`, `paymentPayload`, `paymentRequirements`. The exact browser SDK
constructs EIP712 `TransferWithAuthorization`, domain USDC/version2/8453/official
token, value10000, fixed same owner from/to, 65-byte signature and payment identifier.
Mocks validate full envelopes and cryptographically verify fixture JWT claims.

Verify result requires boolean `isValid`. Settle result requires boolean `success`,
string `transaction` and string `network`; missing/malformed data throws
`FacilitatorResponseError`. Non-2xx typed errors can carry status and candidate
transaction fields; generic SDK errors include response excerpts and MUST NOT be
persisted. Verify/settle do not automatically retry. The SDK timeout is 90000ms.
Only getSupported has retries; this payment path does not call it.

Safe local diagnostics retain stage, fixed kind, typed HTTP status when available,
and a strictly validated Base candidate hash. They never retain error message,
arbitrary reason, body, payer, signature, nonce, JWT or secret. Candidate hashes
remain unconfirmed lookup hints and do not change pending into settled. Historical
receipt GETs do not create diagnostics or rewrite existing ledger rows or caps.

## Recovery boundary

This patch cannot reconstruct discarded historical exceptions or recover a missing
hash. No deployment or new payment is proposed by this audit. Provider history or
a known transaction hash may support read-only reconciliation; the old pending
receipt and one-start cap remain closed until separately reviewed evidence exists.

Sources inspected locally: pinned SDK `_esm/x402/facilitator.js`, `_types/x402/facilitator.d.ts`,
`_esm/auth/utils/jwt.js`, x402 core HTTPFacilitatorClient/types/schema implementations.
Official references: [CDP facilitator](https://docs.cdp.coinbase.com/x402/seller/facilitator),
[Circle token addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses).


## Read-only expiry/finality reconciliation

Published commit5075 validates, before ledger creation, `validAfter <= server now`,
`server now < validBefore <= server now + 300`, and EIP712 signature ownership on
8453/officialUSDC/value10000/same owner. The fixed browser SDK sets validAfter0
and validBefore to its current clock+300, but the server bound is decisive even
if browser time differs. The ledger contains only UTC day, not createdAt,
updatedAt, actual validBefore or nonce; exact signature expiry is unrecoverable.

The pending receipt was read with HTTP Date `2026-10-05T01:48:26Z`. Given normal
shared UTC between Cloudflare server clock and HTTP Date, any authorization
accepted before this observation has validBefore at most `01:53:26Z`. This is a
conservative upper bound, not the original expiry. It is fixed in the read-only
checker and is not pushed forward each time the checker runs.

Worker version3678e4e9-e4f4-455c-864c-6a7c375c1808 was created at
`2026-10-05T01:19:58.944034Z`, with compatibility2026-09-01/nodejs_compat. The
standard owner page requires enabled API info before signing, so this version's
creation time is an earlier bound for that page's newly accepted flow. Reconstructed
same-commit Wrangler output reproduces the pre-verify defect; the production
bytes were not independently downloaded and no historical exception was retained.
Do not turn reconstructed-code evidence into a fabricated production log.

At `01:53:24Z` wall-clock check, Base finalized block52187510, hash
`0xed42502e4516c70f3f6e329eba9c133014a9450f35daac065e4ca04694afb174`,
had timestamp`01:39:27Z`. Inclusive contiguous ranges52185359..52187358 and
52187359..52187510 returned zero officialUSDC owner-to-owner Transfer events.
Start block timestamp`00:27:45Z` precedes publication. The finalized endpoint hash
was rechecked by block number. The ranges are complete but do not yet include
all possible validity time; do not report expiry/finality reconciliation complete.

The checker `node worker/reconcile-mainnet-readonly.mjs` performs only receiptGET
and RPC eth_chainId/eth_getBlockByNumber/eth_getLogs. It splits inclusive2000-block
ranges without gaps and pins the scanned finalized endpoint. Completion requires
finalized block timestamp>=`2026-10-05T01:53:26Z`; wall-clock expiry alone is not
sufficient. Finality's wall-clock completion time cannot be guaranteed. No polling,
transaction, nonce retrieval, receipt mutation or capacity reopening is implemented.

Current BaseScan verified implementation reference is
`0x2Ce6311ddAE708829bc0784C967b7d77D19FD779`. Its verified source enforces
`require(now < validBefore)` and unconditionally emits `Transfer(from,to,value)`
after balance updates, including successful same-address transfer. Therefore, with
normal USDC behavior/UTC/finalized canonical chain, zero events throughout the full
published owner-flow window and finalized timestamp past the conservative upper
bound would exclude both a successful self-transfer in that window and a future
successful transfer using that expired authorization. It does not prove absence of
reverted/pending transactions or identify a nonce, and cannot prove arbitrary
signatures/transactions outside this observed page flow. No matching-event success
can be attributed to a particular nonce without that nonce; none is acquired.

Sources: [current verified implementation](https://basescan.org/address/0x2Ce6311ddAE708829bc0784C967b7d77D19FD779#code),
[Circle EIP3009](https://github.com/circlefin/stablecoin-evm/blob/master/contracts/v2/EIP3009.sol),
[Circle transfer implementation](https://github.com/circlefin/stablecoin-evm/blob/master/contracts/v1/FiatTokenV1.sol).


## Completed bounded reconciliation

At 2026-10-05T02:12:09.2538303Z, official mainnet.base.org finalized block 52188078 had timestamp 2026-10-05T01:58:23Z and hash `0xce43ec9c24c0925b66adb0dc988ca3db675944c99d6d2ffa944084718c7c52c8`.
It exceeds the fixed expiry upper bound 2026-10-05T01:53:26Z. Inclusive contiguous scans covered 52185359..52188078 (from 2026-10-05T00:27:45Z), starting before Worker creation 2026-10-05T01:19:58.944034Z.
Both RPC chunks returned zero officialUSDC owner-to-owner Transfer events of any amount, including10000atomic. The finalized endpoint hash was re-read and pinned. PublicNode initially lagged the official finalized tag; a follow-up independently confirmed the same finalized block/hash and zero events across the same complete scope.

Within the stated clock/standard owner-flow/canonical USDC assumptions, this supports no successful onchain self-transfer in the observed validity window, and no later successful execution of that now-expired authorization. It is not a nonce-state or failed-transaction proof and does not rewrite the still-pending API record. No unlock, reset, signature, transaction, deployment or production state change occurred. Polling stopped after completion.

Evidence: `mainnet-reconciliation-2026-10-05.json` and `mainnet-reconciliation-secondary-2026-10-05.json`. Base finality reference: https://docs.base.org/specifications/transactions/transaction-finality .
