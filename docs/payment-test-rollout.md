# Approved Base Sepolia x402 test

User approval covers 0.01 test USDC, the supplied receiving address, bilingual
voluntary/no-goods/no-refunds disclosures, 5 starts per UTC day/20 total and
private payment-ID/status/terms/date/transaction-hash storage. No signatures,
payment payloads, payer addresses, IPs, UA or visitor identifiers are logged.
Browser receipt IDs are created only after explicit consent/button action and
kept in sessionStorage; reading the page creates no payment identifier.

Routes on the existing apex/www Worker:
- GET `/contribution/info`: free machine-readable terms/status.
- POST `/contribution/test`: consented v2 exact testnet challenge and settlement.
- GET `/contribution/receipt/<payment-id>`: free private receipt by random ID.
- `/contribute/`, `/ja/contribute/`: static human disclosures and optional Rabby UI.

No payment middleware surrounds existing free content. SQLite `Payments` is a
separate DO (v2 migration), while Counter/site keeps its old namespace and value.
No new DNS/credentials/wallet key/provider account. Public facilitator is fixed
to `https://x402.org/facilitator`; its supported endpoint is checked for v2 exact
Base Sepolia, with 20-second bounded SDK calls. No mainnet or provider fallback.

Emergency stop: `PAYMENT_MODE=off` in Wrangler vars then deploy; off is the code
default for missing/unknown values, and `mainnet` is treated as off. Existing
read-only receipts remain available. Already submitted in-flight authorizations
may finish; stopping does not revoke a wallet signature or reverse a transaction.

20 total rows remain throughout this bounded experiment. Never reset/delete
records and reopen old IDs; end the experiment with mode off. No raw payment
logs are publicly released. Anonymous starts can exhaust the cap; the UI says
so. Test operators use `?measurement=test` for unsigned validation: no ledger
record/quota use, and any signed payload on that URL is rejected before verify.

An atomic claim persists verifying before network work. Interrupted verifying/
settling and any ambiguous reply return pending with no automatic retry. Same
ID/changed terms is 409; settled IDs return their receipt. Pending reconciliation
requires provider/chain evidence; there is no blind resettlement command.

Rabby UI requests accounts, a chain switch and EIP-712 signature only after
explicit owner consent and a validated challenge. It never requests a private
key, token approval, ETH transfer or raw transaction signing. Signature payloads
are in memory only and submitted once. Unknown submission results disable the
button and preserve the receipt ID; no automatic payment retry.

Self-transfer: Circle's `_transfer` permits from==to, subtracting then adding
to the same balance; EIP-3009 consumes the authorization nonce. The official
x402 browser SDK can construct that authorization without an RPC or ETH. This
supports a protocol test but not a net contribution. Actual facilitator/chain
execution, including the user's Rabby/key type, remains unverified until the
user signs. A different owner-controlled payer is optional for observing a net
balance increase, not needed to prepare the receiving address.

Sources: [Circle transfer implementation](https://github.com/circlefin/stablecoin-evm/blob/master/contracts/v1/FiatTokenV1.sol),
[EIP-3009 implementation](https://github.com/circlefin/stablecoin-evm/blob/master/contracts/v2/EIP3009.sol),
[Rabby custom networks](https://support.rabby.io/en/articles/14122934-how-to-add-and-view-custom-networks),
[Base network details](https://docs.base.org/get-started/connect-to-base).

Verification distinguishes: mock/real-workerd safety tests and unsigned
production challenge checks versus a completed signed onchain payment. The
implementation agent must never conduct the latter; the user chooses/signs.
