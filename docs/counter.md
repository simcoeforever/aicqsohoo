# Legacy home-page counter

`static/counter.js` sends POST /hit on production home-page loads; GET /hit reads
without incrementing. Reloads and JavaScript-capable crawlers can count. This is
not a count of unique people or AIs. Local previews and pages explicitly marked
`?measurement=test` send no legacy counter POST. The integer table and Durable
Object name `site` remain unchanged; do not reset or migrate the namespace.

The operator reported 16 on 2026-09-30 and 42 on the morning of 2026-10-04.
Their breakdown is unknown. They are historical observations, separate from the
new browser event series. The live integer can continue increasing. A later
production GET verification also read 42; this does not identify its sources.

The optional daily aggregate measurement is described in
[measurement.md](measurement.md). The Worker no longer stores only one integer
when measurement is enabled. Request logs remain disabled in wrangler.jsonc.

Repository configuration names `aicqsohoo-counter` with SQLite-backed `Counter`
and workers.dev enabled. Prior documentation described Workers Builds deploying
from `worker/` on main pushes, but current production bindings, automatic builds,
account plan and privileges were initially unverified. Production configuration
and Free account limits were subsequently checked; see [production.md](production.md).
Publishing repository changes may also invoke external Worker build integrations.
Routes are managed separately so ordinary deployments preserve fail-open settings.

Local tests: `node --test worker/tests/*.test.mjs tests/browser.test.mjs` from the
repository root. Runtime staging validation with Wrangler requires its toolchain
was completed after correcting npm's platform selection for the local command.
Wrangler dry-run and real-workerd tests passed. Live HTTPS/origin/routing and test
storage checks also succeeded. No new application dependency was added.
