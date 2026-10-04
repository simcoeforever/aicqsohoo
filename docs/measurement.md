# Access measurement and weekly experiment articles

## Production boundary

Source baseline: `890369e40a0bb85cf08cef66b8f60111d4d5519a`. An isolated fresh
checkout was used. No AGENTS.md or .agents skills exist in the checkout. No runtime
memory location was supplied; unrelated memories and credentials were not searched.

Source shows GitHub Pages and a separate Cloudflare Worker. Actual deployed code,
bindings, account plan, Workers Builds, permissions and availability are unverified.
Failed retrieval elsewhere does not establish downtime. No pushes, deployments,
DNS changes, secrets, permission changes or activation were performed.

See [rollout-options.md](rollout-options.md) for the optional edge route, public
summary alternative, costs, recovery and resolved workerd diagnosis.
Reuse existing SQLite Durable Object and GitHub Actions; no new service or PC
scheduler. Monday 06:17 UTC generates the previous Monday-to-Monday week. Both
measurement and weekly operation default to disabled.

## Data policy

POST /event accepts only allowlisted public pages, page_view/submission_intent,
referring hostname and explicit boolean test flag. Experiment articles are grouped
as /experiment/. Server time becomes a UTC day. SQL stores counts, not individual
events. Client extracts document.referrer's hostname and sends no fetch Referer
(referrerPolicy=no-referrer). Empty is unknown; site referrers are internal. No IP,
Cookie, IDs, fingerprints or User-Agent is inspected. URLs are parsed in memory
for routing/referrer normalization and the explicit test flag; full URL/query
values are never added to application storage, exported or copied to articles.
GitHub and Cloudflare still process requests under their own platform policies.

Daily expiry alarms and event-time cleanup delete aggregates older than 90 UTC
days; alarm delay can extend expiry by about a day. Source cardinality is bounded
at 100/day, then new values fold into other. Body size is at most 1 KiB; page and
event sets are bounded. CORS Origin is not authenticity: clients can fabricate
events. Keep request logging disabled. No raw analytics export is implemented.

GET /summary (private by default; opt-in public mode) exports only closed
nonoverlapping Monday UTC weeks from the last 84 days. Weekly non-test browser
page views, edge resource GETs and submission-link clicks at least 10 are released
as **10-event bands**: 22 stored events export lower bound 20 and render as 20–29.
Null means suppressed, including possible zero. No cumulative totals are exported.
Closed-week exports are sealed per schema version, so repeated reads do not
recompute different snapshots. Their small policy-filtered cache is purged after
90 days when the API is used. Public mode omits first-event date and uses coverage
not_verified, avoiding publication of the first small observation's day.
Domains and frequent public pages are named separately without counts only when their event count is at least 10 and
their complement is zero or at least 10. Unknown/internal/other are not published.
There are no day/page/source cross-tabs, test counts or small residual counts.
This is event suppression, not differential privacy or unique-person anonymity:
10 events may be from one person. Do not add fine-grained public breakdowns.

The first accepted event date establishes coverage not_started/partial/configured;
it is not proof of uptime, delivery or zero visitors. Legacy counter observations
16 (2026-09-30) and 42 (2026-10-04 morning), reported by the operator, have unknown
breakdown and remain separate. The integer is never reset. Clicks are intentions,
not submissions or useful reuse. Controlled discovery outcomes are aggregated
separately from discovery/tests.jsonl; raw queries/notes/system details are omitted.

## Machine access limitations

Without the optional approved edge route, HTML/JSON/llms.txt bypass the Worker.
The disabled-by-default gateway can observe successful allowlisted GETs without
JavaScript, as a separate resource_get series. Route bypasses, failed telemetry,
default github.io URLs and error/HEAD responses remain unobserved. Browser and edge
series overlap and must not be summed. Neither establishes AI identity; no UA is read.
DNS proxy/route activation still requires independent approval.

## Articles and failure handling

weekly_report.py authenticates, refuses redirects, validates the disclosure schema
and writes immutable data/reports/DATE.json. Templates separate facts, hypotheses,
changes, next steps and limits, with no invented observations. Only reviewed
public_summary intervention text is copied, not raw what/by/source. Missing
discovery tests are described as absent evidence. Reports are committed, tested,
built and deployed by weekly.yml. GITHUB_TOKEN pushes do not trigger pages.yml,
so the weekly workflow performs its own deploy. Both share concurrency group pages.
Push conflicts and branch-protection rejection stop publication; no force push.

Reruns keep existing reports. API/schema/secret failures stop before commit/deploy,
leaving the previous site intact. Use GitHub Actions notifications/status to notice
failures. Schedules may be delayed; inactive public repositories may be disabled
after 60 days. Missed weeks can be regenerated with --start YYYY-MM-DD during the
84-day export window after authorization. Corrections are deliberate reviewed edits.

## Approvals and rollout order

1. Confirm live Worker account/plan, Counter binding/name/migration, Pages workflow,
   Workers Builds and whether merges trigger deployments. Approve publication before
   pushing/merging; older docs describe automatic Workers Builds on main.
2. Approve use of existing Cloudflare quotas/cost envelope. SQLite Durable Objects
   exist on Free, but actual account may be Paid. Events add SQL reads/writes,
   alarms and requests; free quotas are shared. No plan upgrade or paid analytics.
3. Deploy Worker with METRICS_ENABLED=false and unchanged Counter namespace. Publish
   About/privacy and baseline article with browser measurement disabled first.
4. Choose the approved API mode in rollout-options.md. Private mode requires one
   high-entropy REPORT_TOKEN Worker secret and matching GitHub Actions secret;
   public disclosure-filtered mode requires no new secret. Never put secrets into
   source, printed commands or articles. Set
   SUMMARY_URL to the existing HTTPS workers.dev /summary endpoint, with no new DNS.
   The token authorizes disclosure-filtered summaries only, not raw records.
5. Verify Wrangler local/staging runtime. Then approve Worker METRICS_ENABLED=true
   and GitHub variable METRICS_ENABLED=true; rebuild Pages to include the script.
   Update PUBLIC_PAGES whenever adding experience/agent pages.
   Make the approved Worker toggle in wrangler.jsonc (and deploy it), rather than
   relying only on a dashboard override that a later source deployment could reset.
6. Approve weekly job contents:write, pages:write, id-token:write and bot commits
   directly to main. Confirm branch protection and github-pages environment allow
   unattended publication. Do not bypass protection; use a reviewed PR alternative
   if direct pushes are prohibited. No PR or new GitHub token was created here.
7. Approved production smoke checks must use ?measurement=test on every tested page.
   GET /hit must not increment; /summary without auth must return 401; authorized
   export must contain no raw rows/small groups. Approve ENABLE_WEEKLY_REPORTS=true
   only after these checks. An approved manual run verifies commit/deploy end to end.
8. Record actual rollout timestamps and reviewed public_summary in the intervention
   notebook; none were fabricated during local preparation.

## Rollback and validation

Set ENABLE_WEEKLY_REPORTS=false. Disable Worker and browser METRICS_ENABLED, rebuild
Pages and retain privacy/history and the legacy counter. Installed alarms expire
stored counts. Reverting to code without alarms requires an explicit deletion plan.
Revoke/rotate REPORT_TOKEN when needed. Review public article corrections separately.

Local checks: python -m unittest discover tests; node --test worker/tests/*.test.mjs
tests/browser.test.mjs. Real SQLite with a DurableObject shim checks migration,
transactions, expiry, source cardinality, disclosure, routes, authentication and
body limits. Browser tests check minimal payloads, referrers and test separation.
Python checks schema rejection, no-data articles, opt-in build and existing site.
workerd diagnosis was completed: existing npm os=linux selected the wrong binary.
A per-command win32/x64 override, with no global configuration or lockfile change,
fixed it. Wrangler local dry-run and a real-workerd test passed (SQLite/RPC, counter
concurrency, alarm scheduling, input limits, authentication and summary). Expiry
alarm execution is tested via the SQLite shim, not by waiting 90 days in workerd.
Live origin routing/TLS/DNS, real account permissions, secret setup, branch
protection and full scheduled production deployment remain unverified.

Official references checked:
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
