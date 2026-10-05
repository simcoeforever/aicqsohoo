# Mainnet signing-domain correction — local only, 2026-10-05

## Confirmed defect and correction

Generation 3 receipt `main3_3fbf09a5-b5ff-433b-94df-929dbaed05b4` is pending with `verify / provider_rejected / HTTP 400`. The implementation had not reached settle; no transaction candidate was recorded. The CDP invalidReason/body was not retained, so its exact historical rejection reason remains unknown.

The implementation incorrectly used the Base Sepolia EIP-712 name `USDC` for Base mainnet. Mainnet's official token reports `USD Coin`. This is a concrete signature-domain defect, independently reproduced offline; it is not Base transaction-confirmation latency. A previous mock reused application terms for its expected domain and therefore missed it. The earlier V2 low-balance observation does not establish V2's exact provider rejection reason; this domain defect also existed then.

Local correction changes mainnet challenge terms, browser signing guards, and Worker cryptographic verification to `USD Coin`. Sepolia remains `USDC`. Generation, nonce, validAfter, caps, bindings, historical receipts, and production state are unchanged. No push, deploy, reset, new generation, real wallet signing, or payment call has been performed for this correction.

## Independent contract baseline

`worker/tests/fixtures/usdc-domains-onchain-2026-10-05.json` was obtained by direct public eth_call. Neither application terms nor application domain constants were imported into its generator. Each network was checked through its official RPC and PublicNode, using a finalized tag pinned before/after all reads. These were read-only JSON-RPC POSTs, not facilitator verify/settle or transaction submissions.

| Field | Base mainnet | Base Sepolia |
| --- | --- | --- |
| chainId | 8453 | 84532 |
| official token | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 | 0x036CbD53842c5426634e7929541eC2318f3dCF7e |
| name() | USD Coin | USDC |
| version() | 2 | 2 |
| decimals() | 6 | 6 |
| DOMAIN_SEPARATOR() | 0x02fa7265e7c5d81118673727957699e4d68f74cd74b7db77da710fe8a2c7834f | 0x71f17a3b2ff373b803d70a5a07c046c1a2bc8e89c09ef722fcb047abe94c9818 |

Both providers agree for each network. Hashing the domains constructed from the returned contract name/version, observed chainId, and queried contract address reproduces each separator exactly. A repeatable read-only script is `worker/scripts/audit-usdc-domains-readonly.mjs`.

## Validation and its limits

The independent baseline test checks both networks against pinned x402 2.28.0 ExactEvmScheme payloads: exact/v2, fixed official asset, atomic 10000 (0.01 at six decimals), fixed recipient, actual signer as payer, TransferWithAuthorization field names/order/types, validAfter in the past, validBefore within 300 seconds, and bytes32 nonce. Mainnet additionally enforces owner-to-owner, generation-specific nonce/validAfter, current-time validity and the five-minute maximum before quota reservation/provider calls. Browser chain/account/balance checks retain their fail-closed behavior; testnet has a distinct domain and route.

The fresh Wrangler dry-run upload artifact is tested as the byte-identical prefix in Miniflare. A local-only appended DO exposes the bundled domain and the bundled viem verifier for a public fixture account; it is never part of a deploy artifact. A canonical-contract-domain signature passes. Signatures with the old name, wrong version, wrong chain, or Sepolia contract fail. Normal production routing rejects old mainnet terms with 409 and an invalid signature under canonical terms with 403, makes zero outbound calls, and leaves the local ledger empty. This does not claim a positive actual owner's production signature was tested: no owner key or signed payload is available/retained.

Full Node suite: 50 passed, zero failed/skipped with upload-bundle options enabled. Python: 31 passed. Workerd runtime passed against the corrected upload bytes. Chrome EN/JA mainnet: 22 cases passed; Sepolia: 3 cases passed. All payment/wallet/service calls in these tests were local mocks. An initial browser test overlapped Python's rebuilding of site files and failed navigation; rerunning after build completion passed. No production outage is inferred from that local test fixture race.

## Unverified assumptions / before any further production attempt

- Contract metadata is a dated snapshot. USDC proxy implementations/domain metadata can change; refresh both RPC baselines before approving a release.
- The actual owner's newly signed payload has not been tested. Wallet UI displaying the right network/token/value alone does not establish the EIP-712 domain or contract acceptance.
- CDP /supported authentication and local mocked JWT transport do not establish that real verify/settle will accept a self-transfer, relay successfully, or remain available. No real verify/settle was requested for this correction.
- Server uses its UTC clock and accepts validBefore only within 300 seconds. Worker/Rabby/SDK clock skew or a long wallet review can expire an authorization; signature/header byte parity is exercised with fixtures, not the actual owner's signature.
- Receipt stores neither createdAt nor actual validBefore. The conservative V3 expiry upper bound is fixed at 2026-10-05T05:51:36Z, from the first pending response's HTTP Date 05:46:36Z plus the server-enforced 300 seconds, assuming normal Worker UTC. Finality reconciliation must not move that bound later on each poll.
- The pending receipt is deliberately not rewritten: a provider error after a signed submission consumes the single start. Local correction cannot reopen generation 3. Publication and any new generation/attempt require separate approval and a reviewed release artifact.
- A zero nonce state and zero successful self-transfer logs through an expiry-covering finalized block establish the bounded no-success result, not absence of reverted/pending transactions, and cannot recover the historical provider error body.

No new authentication, permissions, cost, DNS/proxy settings, or production configuration changes are part of this local correction.

## Local reproduction commands (PowerShell)

From the repository's worker directory:

```powershell
node build-payment-client.mjs
$env:WRANGLER_LOG_PATH = Join-Path $PWD '.wrangler/domain-fix-build.log'
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir .wrangler/domain-fix-dryrun
$env:AICQ_DOMAIN_BUNDLE = (Resolve-Path .wrangler/domain-fix-dryrun/index.js).Path
$env:AICQ_AUDIT_DEPLOYED_BUNDLE = '1'
$env:AICQ_AUDIT_BUNDLE_PATH = $env:AICQ_DOMAIN_BUNDLE
node --test tests/*.test.mjs ../tests/payment-client.test.mjs
```

The dry-run command builds locally and exits; it does not deploy. Run `python -m unittest discover -s tests` from repository root, then run browser fixtures after Python has finished rebuilding site files. Keep the old deployed V3 bundle/manifest as historical evidence. Its publication helper is not a release helper for this domain fix; a separately reviewed manifest/commit is necessary before any approved publication.

## V3 finalized reconciliation completed

At 2026-10-05T06:14:50.951Z, official Base RPC and PublicNode agreed on finalized block 52195188, timestamp 05:55:23Z, hash `0x2eb9addbc9db6676a51d6e18f6afe6746558b94e2beee9beb942ab6ece48039d`. This is after the fixed 05:51:36Z expiry upper bound. Both report generation 3's public nonce unused/uncancelled and zero owner-to-owner official-USDC Transfer logs, of any amount, in inclusive range 52194000–52195188. Start block timestamp 05:15:47Z is before fixed signed validAfter 05:20:00Z; therefore the range covers the entire possible successful V3 authorization window without gaps.

An initial scan began at the earlier V1 release boundary and encountered provider historical-range restrictions (PublicNode logs HTTP403; additional dRPC logs HTTP400). No credentials or provider access were expanded. The final V3-specific range is both complete for this authorization and supported by the original two RPCs. PublicNode nonce state used its supported finalized tag, pinned before/after to the same hash; the official RPC used the numbered finalized block.

Evidence is `docs/mainnet-v3-reconciliation-2026-10-05.json`. The production receipt was re-read as HTTP202, pending, retry_payment=false, verify/provider_rejected/400; mainnet generation 3 remains disabled with its slot consumed. No receipt/state/cap was changed. This establishes no successful use of this authorization in the bounded finalized window; reverted/pending transactions and exact historical CDP invalidReason remain outside the evidence.
