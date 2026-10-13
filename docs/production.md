# Production measurement, 2026-10-04

The privacy explanation was published before measurement activation. The existing
Worker and SQLite Durable Object were updated without resetting the legacy integer
(42 at deployment verification). The custom domain remains backed by GitHub Pages.

The apex and www DNS records retain their origin values and now use Cloudflare's
proxy. SSL/TLS is Full (strict). Both HTTPS Worker routes use fail-open on the free
request limit. The observed account limits (100,000 requests/day and 200,000 log
events/day) match Workers Free; no billing subscription was changed. Application
request logs remain disabled.

Important deployment detail: Wrangler recreates source-configured routes and resets
request_limit_fail_open to false. Therefore the two existing HTTPS apex/www routes
are managed separately through the Cloudflare API/dashboard and are omitted from
wrangler.jsonc. With no routes to publish, the pinned Wrangler leaves existing
routes untouched. Read back both routes after deployments. Do not add a routes
array without also preserving fail-open. The weekly site workflow does not deploy
the Worker directly; existing external build integrations may react to repo commits.

Browser collection, edge resource collection and the disclosure-filtered public
summary are enabled in source. The weekly workflow uses public summary mode with
no report token. It runs Monday 06:17 UTC / 15:17 JST, on manual dispatch, and when
its workflow configuration changes. GitHub may delay scheduled runs. Setting the
repository variable ENABLE_WEEKLY_REPORTS=false pauses publication; setting
METRICS_ENABLED=false disables browser injection on subsequent builds. Worker
collection is controlled separately by its source configuration.

Test requests use measurement=test. A successful eligible test GET returns
X-AICQSOHOO-Test-Measurement: recorded only after aggregate storage succeeds. This
header has no count, source, user identifier or log payload. Test responses are
not cached. The ordinary response does not receive this header. Tests are excluded
from the public summary; browser events and edge GETs are separate series.

Verification: apex/www HTTPS HTML, experiences.json, agents.json and llms.txt
returned 200, www redirected to the apex, and test resource GET storage was
acknowledged. Tests cover identifier rejection, suppression, immutable closed-week
exports, metric failure preserving origin content, and retention. The actual
100,000-request exhaustion was not induced; fail-open was verified in API settings.

Published data never identifies unique people or genuine AI visitors. Referrer
domains are declarations, empty values are unknown, small counts are suppressed,
and released counts use ten-event bands. No IP, UA, full URL/query, cookie,
fingerprint or visitor identifier is added to application storage or public reports.

## Catalog resource GET alignment, 2026-10-05

`measurement-manifest.json` is generated from the same reviewed public catalog: index/schema JSON, exact record JSON paths and both payment-policy HTML paths. The Worker fetches this public origin metadata without visitor headers, credentials or query, bounded to 64 KiB and 8 seconds; a five-minute in-memory cache coalesces concurrent reads. A missing/invalid manifest disables new-resource counting until refresh while preserving the original response. New weekly JSON paths become eligible on manifest refresh without weekly Worker deployment.

Ledger rows retain UTC date, resource_get, fixed resource-group label, referring domain (or unknown/internal) and explicit test flag/count. Individual record IDs and languages are only public manifest metadata and are not access-ledger fields. Head/error/unknown requests are excluded. Existing source cardinality cap, 90-day retention, threshold10, ten-event bands and immutable closed-week exports are unchanged. The existing public resource_gets field includes these counts; public referring-domain and frequent-page fields still describe browser page views only. No new public referrer schema or per-resource source/count combinations are published. JSON GET does not identify an AI, person, successful discovery or useful reuse. Previously unobserved requests are not backfilled.

Payment-policy HTML uses only the resource GET metric, avoiding an unsupported browser-event request. Payment endpoints, receipts, slots, existing proxy routes/fail-open settings, weekly schedule and billing remain unchanged.

## Exact-total rollout preparation, 2026-10-13

Schema 3 is implemented using existing retained integer aggregates; schema 2
and historic article values remain unchanged. Only non-test whole-week totals
are newly publishable. No change to collection, identifiers, request logging,
retention, secrets, payment modes, routes, fail-open or the weekly schedule is needed.

This environment has no Cloudflare credential variables or Wrangler session;
`wrangler whoami` reports unauthenticated. No login, credential creation or temporary
account was attempted. The existing GitHub Cloudflare Workers Builds integration
reported a successful production build/version for fe79716. The normal push
path can therefore be used and its check/version recorded without new credentials.
Pages CI also runs the exact-total regression and local workerd checks.

Public aicqsohoo.com and the existing workers.dev summary endpoint are blocked
by this environment's CONNECT proxy (403). A successful Workers Builds check
can establish a produced version; it cannot substitute for observing the live
`schema=3` response. Until that response is checked, do not claim measured
production exact totals or rewrite a historical report. An external existing
authorized environment can read the public summary with no new report token.

## Production response confirmed by user-provided screen capture, 2026-10-13

The source conversation visually confirmed the production schema 3 response for
2026-10-05 inclusive to 2026-10-12 exclusive UTC: 27 page-view events, 0
submission-link clicks and 1798 successful resource GETs; precision
exact_recorded_events, origin retained_aggregates, coverage not_verified,
started null. The response fields and verification provenance are archived in
`data/measurement-confirmations/2026-10-05.json`. The English/Japanese weekly
article was deliberately updated using those confirmed fields. Old publication
bands remain in git history. This environment did not retrieve the live response
or inspect the screenshot locally; the supported image download failed.

The existing schema 2 frequent_pages and referring domains concern browser
page_view events only. They do not disclose resource_get categories or counts.
Schema 3 exposes only whole-week totals. No existing public endpoint provides
GET category totals or daily GET totals. The missing data for that analysis is
non-test resource_get sums by the stored fixed resource groups (and UTC day if
needed); none has been retrieved or newly published in this change.

## Coarse GET export rollout, 2026-10-13

The separately sealed schema 4 provides approved five-kind whole-week GET
counts from existing aggregates. It changes no credentials, Worker bindings,
routes/fail-open, observability, collection, payment modes, retention or weekly
schedule. Use the existing main push / Cloudflare Workers Builds integration,
then read its check and version metadata. Do not create a new login/token.

This environment's public endpoint proxy denial is already established; do not
repeat denied requests. Production verification URL:
https://aicqsohoo-counter.waste-tkt.workers.dev/summary?start=2026-10-05&schema=4

Expected: schema 4, start 2026-10-05, end 2026-10-12, coverage not_verified,
started null, category_policy coarse_resource_kinds_v1, resource_gets 1798
(the already confirmed schema 3 snapshot), categories containing html,
article_json, catalog_json, llms_txt and other_unknown. When category_status is
available, matches_schema3_total must be true and the five returned counts must
sum to 1798. Actual category values remain unobserved here. Null categories and
unavailable/snapshot_mismatch indicate a missing or inconsistent retained
partition; never fill them with estimates. No category counts are added to the
October 5 article before a real response is confirmed.
