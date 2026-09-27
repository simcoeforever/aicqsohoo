# Visitor counter

A real 1990s hit counter on the home page.

## How it works

- `static/counter.js` sends one `POST https://aicqsohoo-counter.waste-tkt.workers.dev/hit` per home page load and shows the returned number, zero-padded to 7 digits.
- `worker/`: a Cloudflare Worker with one SQLite-backed Durable Object. The increment is a single SQL statement (`INSERT ... ON CONFLICT DO UPDATE SET n = n + 1 RETURNING n`) inside a single Durable Object, which handles one request at a time, so simultaneous hits never overwrite each other (50 parallel hits against `wrangler dev` gave exactly +50).
- `GET /hit` returns the count without adding one.
- POST is accepted only when the `Origin` header is `https://aicqsohoo.com` or `https://www.aicqsohoo.com`. This stops other websites' pages from inflating it; anyone with curl can still add hits. It is a joke counter, not a metric.

## What it counts

- Home page loads, including reloads. Other pages have no counter.
- Crawlers that run JavaScript count; those that do not (most) never send the POST. No other bot filtering.
- Stored: one integer. No cookies, no IP addresses, no user IDs, no analytics. Worker request logs are off (`observability.enabled = false`).

## If it breaks

The page renders without it. The digits stay `???????` if the request fails, takes over 4 seconds, or the free daily limit is reached.

## Cost

Checked against developers.cloudflare.com on 2026-09-27:

- Workers Free: 100,000 requests/day.
- Durable Objects on Free: SQLite storage backend only; 100,000 requests/day, 100,000 rows written/day; limits reset 00:00 UTC.

One hit = one Worker request + one Durable Object request + one row write, so roughly 100,000 home page loads per day for $0. Above that, hits fail for the rest of the UTC day and the page shows `???????`.

## Deploy

One-time, in the Cloudflare dashboard:

1. Workers & Pages → Create application → Import a repository → choose `simcoeforever/aicqsohoo`.
2. Root directory: `worker`. Keep the deploy command `npx wrangler deploy`. Worker name `aicqsohoo-counter`. Save and Deploy.
3. (Skipped for now.) A custom domain such as `counter.aicqsohoo.com` could replace the `workers.dev` address later: Worker → Settings → Domains & Routes → Add → Custom domain. On 2026-09-27 the dashboard said "No zones match" for it, so the site uses the `workers.dev` address.

After that, pushes to `main` redeploy the Worker automatically (Workers Builds, free plan: 3,000 build minutes/month).

The custom domain is not in `wrangler.jsonc` because the token Workers Builds creates may not have permission to create DNS records. If it is ever added, change `COUNTER_URL` in `build.py`.

Local test: `cd worker && npm install && npm run dev`, then build the site with `COUNTER_URL=http://localhost:8787/hit python3 build.py`.
