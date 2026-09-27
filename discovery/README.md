# Discovery experiment

Question: can people, crawlers and AI web search find an AICQSOHOO! experience page **without being given the URL or the site name**?

This folder is the lab notebook. It is not part of the published site (`build.py` only reads `data/`, `templates/`, `static/`).

## Day 0

**Day 0 = 2026-09-27.** On Day 0 the only discovery work is ordinary crawl hygiene plus search-engine submission:

- static HTML with descriptive titles, canonical URLs, internal links, JSON-LD, `sitemap.xml`, `robots.txt`
- Google Search Console: ownership verified, sitemap submitted
- Bing Webmaster Tools: ownership verified, sitemap submitted, manual indexing request for the homepage

Everything after that is an **intervention** and goes into `interventions.jsonl` with a UTC timestamp, including changes made later on Day 0 (for example `llms.txt`). When a test result changes, check which interventions came before it. Do not credit one intervention when several happened between two tests.

## Files

| File | What it holds |
|---|---|
| `interventions.jsonl` | One line per event that could change discovery: publish, submissions, new machine-readable files, external links, posts, registries. Append only. |
| `queries.json` | Target queries per seed experience, in English and Japanese. The expected page is the one that should come up. Queries never contain the site name, the domain or unusual phrases copied from the page. |
| `tests.jsonl` | One line per test (one query, one system, one time). Empty until the first test. Append only. |

## How to run a test

1. Use a **fresh** session with web search on: ChatGPT, Claude, Gemini (and plain Google / Bing as a control). Logged in is fine, but no memory or custom instructions that mention AICQSOHOO, and no earlier turns in the chat.
2. Paste the query exactly as written in `queries.json`. Do not follow up with hints.
3. Record one line in `tests.jsonl`:

```json
{"tested_at": "2026-10-04T10:00:00Z", "day": 7, "system": "chatgpt-web-search", "system_detail": "model or mode shown in the UI, if visible", "query_id": "q-open-tonight-en", "query": "...", "discovered": false, "cited_url": null, "position": null, "what_came_up": "short note on what it answered or cited instead", "tester": "human", "notes": ""}
```

- `discovered`: the answer cites or links any `aicqsohoo.com` page.
- `cited_url` / `position`: which page, and its order among cited sources, if visible.
- `what_came_up`: what it relied on instead. This matters as much as a hit.
- For Google / Bing controls, also record `site:aicqsohoo.com` result counts as a separate line with `query_id: "site-check"`.

Suggested schedule: Day 0 (baseline, expected all misses), Day 3, Day 7, Day 14, Day 28.

## Rules

- Record misses. A page that is never found is a result.
- No ranking claims beyond what a test line shows. One hit in one session is one hit.
- Do not change a query after its first test. Add a new query id instead.
- These queries are public in this repo. That is unlikely to matter, but note it if a result looks suspicious (for example a hit that quotes this file).
