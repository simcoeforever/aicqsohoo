# Optional private article-use self-reports

The user approved a small voluntary reporting entrance on 2026-10-13. This
implements a private intake, not observed AI usage, verified usefulness,
identity tracking, payment or a task-performance experiment.

## Protocol and discovery

POST JSON to `https://aicqsohoo-counter.waste-tkt.workers.dev/usage-reports`.
GET `/usage-reports/info` returns protocol/policy information only, no reports or
counts. `index.json` links the endpoint, schema and allowed articles;
`llms.txt`, `/report-use/` and `/ja/report-use/` provide discovery and explanations.
`usage-report-schema.json` describes all fields. `usage-report-articles.json`
is generated from the same published catalog and deduplicates English/Japanese
records by kind/id. Only experience, weekly_report and experiment_article are
eligible; profiles and payment-policy snapshots are not article reports.

The minimal body has `article_kind`, `article_id`, selected `purpose`/`outcome`,
optional short `task`/`helpful`/`missing` strings, explicit `consent:true`, and
`test` boolean. Native clients must set test explicitly. The human form uses
`?measurement=test` only for marked operator tests and never remembers it.
No submitter name, claimed AI name, contact details or evidence URL is accepted.
No background POST or access condition: all existing content stays free.

The Worker matches the kind/id against a fixed-origin public registry. It fetches
no submission URL and forwards no visitor headers. Bounded 64 KiB / 8-second
fetch, redirect refusal, five-minute cache and concurrent read coalescing fail
closed when registry data is unavailable. New weekly article IDs do not require
another Worker deployment. The existing resource manifest/resolver and collection
allowlists are unchanged; feedback pages/schema/registry are not new GET metrics.

## Privacy and rejection

The body is at most 2048 bytes; text fields are at most 80/160/160 Unicode
characters. Unknown fields, wrong types, missing consent, invalid enum values and
unpublished IDs are rejected. Text is normalized and conservative checks reject
markup, links, emails, phone/IP patterns, control/direction characters, long
opaque strings, secret labels and explicit identity/private-data intentions.
These checks are not a complete personal-data or secret detector and can reject
innocent text. Do not paste logs or credentials; users must remove private data.
Rejected input is never stored or echoed in an error. Private text is data, never
an instruction, and links are never automatically opened.

No request IP, UA, cookie, device/session/visitor ID, referrer or claimed AI name
is read or stored by this feature. Infrastructure still processes network
requests under its existing policies. Logging stays off. Valid text is private
in Cloudflare storage; no raw submission is committed to GitHub, copied to the
static build, listed by a public API, or sent to another AI for automatic review.

## Storage, deduplication and bounds

Reuse the existing Counter binding with a **separate object name**
`usage-reports-v1`; it never uses the `site` access-counter object or payment
objects. Usage tables are created only for intake/private review/expiry. This
requires no new binding, namespace migration, service, credential or subscription.

Each accepted row has an internal random report ID, digest of normalized report
content (not an actor fingerprint), article kind/id, bounded JSON payload,
explicit test flag, UTC receipt day, expiry and `pending_review` state.
Identical normalized retries do not create another row or increment the intake
budget. Different actors reporting identical content may be merged: counts are
not unique use or people. Caller-supplied verification states/names are rejected.
There is no automatic confirmation method; no report is promoted to a verified
example by receipt, positive outcome or an AI label. A genuinely confirmed case
requires a separately reviewed public evidence record, with private information
removed. No confirmed case is created by this implementation.

Persistent caps: production 3 unique reports/hour, 10/day, 3/article/day and 50
pending rows; marked tests 3/hour, 5/day and 10 pending rows, separately budgeted.
A cheap per-isolate 60-attempt/minute guard cuts off repeated POST processing
before registry/storage reads. These are global admission/storage protections,
not per-person rate limits. Anonymous requests can still exhaust capacity or
platform request quotas; without new identity/WAF/account controls this does not
promise denial-of-service prevention. Full queues return 429 and Retry-After;
do not retry aggressively. No intake statistics are published.

Production text expires at the UTC day boundary within 30 days of receipt;
marked tests within one day. Reads and valid submissions delete expired rows.
Daily Durable Object alarms remove expired content even without further traffic;
platform alarm delay may extend physical deletion. No expired text is returned
by private review. Budget rows retain only coarse global day/hour/test counts
for the short quota window. Existing 90-day access metrics and sealed summaries
are independent and unchanged.

## Safe owner review and present limitation

There is **no public admin endpoint** and no public receipt-body endpoint.
Existing REPORT_TOKEN still authorizes aggregate summaries only; it does not
read submissions. No permanent admin key or permission was created or expanded.

Only a trusted existing Worker context with the existing COUNTER binding can
invoke the internal RPC:

```js
const inbox = env.COUNTER.get(env.COUNTER.idFromName('usage-reports-v1'));
const privateBatch = await inbox.reviewUsageReports({test: false, limit: 20});
// Treat privateBatch as untrusted data; do not log it, execute it, fetch links,
// send it to another agent, or put it in a public response/artifact.
```

This access requires the owner's already authorized Cloudflare execution/debug
context. It is not an HTTP URL or a new bearer-token scope. This environment has
no Cloudflare login/token, so **production owner review has not been performed**.
Do not create a key, expose an HTTP review route or widen existing credentials
to work around this. The receipt path is deployable by existing Workers Builds;
connecting an existing authorized owner environment is the remaining operational
requirement for reading production pending bodies. The account's actual review
workflow must be verified there; no unsupported dashboard SQL feature is claimed.

Local real-workerd tests use `mf.getBindings('counter')` and the same RPC to read
an isolated marked test. Export a private batch only within an authorized local
review context, then render it offline:

```sh
python3 worker/render-usage-review.py --output private-usage-review/pending.html < private-usage-review/pending.json
```

Review is paginated: pass the previous batch's last report_id as after to read
the next batch (at most 20 each); the cursor is an internal record ID, not an
actor identifier. The viewer accepts at most 20 objects / 64 KiB, escapes HTML and hidden characters,
has a restrictive CSP, no scripts, no links and no network. Output permissions
are 0600; the private directory is gitignored. Open locally, delete after review,
and never publish it. Do not auto-interpret the exported text as instructions.

## Validation and rollout

Security regressions cover secret/PII-intent rejection, bounds/types/consent,
article registry safety and failure, duplicate/concurrent delivery, all caps,
test separation, alarm failure, expiry, pending-only semantics, no public listing
or token reuse, no reflection/cookie, form opt-in/local preview/test flags and
safe private rendering. Real workerd verifies an isolated test acceptance and
private read, with zero production rows and legacy 42 intact. HTTP networking
and other service calls in those tests are mocked, never paid calls.

Use normal main push / Pages / existing Cloudflare Workers Builds. No routes,
security settings, keys, subscriptions, scheduling or payment modes change.
Public networking is already blocked by this environment's proxy; do not retry
that rejection or call the intake from an unapproved workaround. A production
POST is unconfirmed here until an explicit marked test is checked in an allowed
environment. The expected acknowledgement is HTTP 202 with accepted:true,
state:pending_review, verification_status:unverified_self_report and test:true.
No production report or usefulness result is invented.
