# Owner pilot v2: mixed browser client incident, 2026-10-05

## Observed facts

The owner reported a mainnet consent page followed by Rabby typed data for chain
84532 and Sepolia USDC, then receipt `pay_bd9e05dc-7075-4596-b627-860ec7f0fce1`.
Public receipt GET confirms `settled`, `eip155:84532` and transaction
`0x061d1dce4be16b77348f8678ea428bd27caad4be94b76f21cb972d6d4afd5f5e`.
An independent read of this transaction through `https://sepolia.base.org`
returns status `0x1`, block `0x2d7e182` and a Transfer from the fixed owner to
the same owner of 10000 atomic Sepolia USDC. It is not a mainnet result.

At 2026-10-05 04:08:31 UTC, `/contribution/mainnet/info` returned generation 2,
`enabled:true`. In this implementation, enabled requires its ledger row count
to be zero. Thus the mainnet v2 slot was unused at that read. The generation 1
info still returned disabled/consumed=1; its original receipt remained pending
with retry_payment=false. None of these records was reset or altered.

Freshly downloaded public Japanese self-test HTML contains owner-pilot-v2.
The public `/payment-client.js` SHA256 is
`aec709100bed2e9bc90153d172e65c286788b634129670e671b683d0979b518b`, matching
the fc3659b4 release. Its observed Cache-Control was max-age=14400, while the
HTML was max-age=600. Both generations used this same mutable script URL.

## Reproduced defect and inference

The 5075ad3 JavaScript recognizes only owner-pilot as mainnet. Every other mode
silently selects testnet. Feeding the actual downloaded v2 public HTML to that
old bundle in a fresh Chrome context reproduces a GET to /contribution/info,
an unsigned challenge to /contribution/test, and typed data for chain 84532
with Sepolia USDC. The actual current public HTML/current public bundle pair
instead requests the mainnet endpoints and typed data for chain 8453.
Every request in this reproduction was intercepted locally; the mock wallet
refused every signature. No real challenge, verify, settle or payment was sent.

A cached old script mixed with new HTML therefore explains the reported flow,
and the public cache lifetimes permit this mixing. We did not inspect the
owner's browser cache or HAR, so the exact historical delivery path is an
inference, not an observed cache hit. A newly fetched current bundle alone
cannot retrospectively establish what code that browser executed.

## Local fix and validation

Payment pages now reference the SHA256-named bundle and pin its bytes with SRI.
Page pathname fixes the chain; explicit mode, client generation and unique DOM
bindings must agree before any API or wallet call. Unknown modes never fall
back to testnet. Info, challenge, typed-data chain/token/amount/owner and returned
payload are checked; wallet chain/account are rechecked immediately before
signature. Receipts cannot report success for the wrong chain.

Node tests execute the generated browser bundle for both modes, mixed versions,
bad info/challenges, mid-flow wallet changes, DOM changes and wrong-chain
receipts. Python checks the actual generated English/Japanese HTML against
its exact bundle SHA256 and SRI. Fresh Chrome tests reject old JS served under
the new hashed URL via SRI, and block old/missing/testnet modes on owner pages.
Normal mainnet mock flows and existing Sepolia mock flows still pass.

This is a site/client-only change. Worker code, deployed bundle, owner, token,
authorization generation/nonce, one-start limit and all historical receipts are
unchanged. Publication and any further owner signing require a separate decision.
After publication, verify the freshly fetched HTML's hashed script/SRI, its
downloaded bytes and mainnet-info GET; do not reuse an already open payment tab.
An already executing obsolete client cannot be repaired by a server-side asset
change. No additional generation or slot is proposed for this incident.
