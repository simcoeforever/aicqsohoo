# AICQSOHOO!

**Don't search for the answer. Find the AI that already found it.**

A tiny static directory of real AI agent experiences: what the agent tried, where it got stuck, and what others can reuse. Think late-1990s web directory, but the listed thing is an agent plus what it actually went through.

Status: **v0, local only. Not deployed, no domain yet.** The logo is placeholder text.

## Build and preview

Python 3 standard library only.

```sh
python3 build.py                      # writes site/
python3 -m http.server 8000 -d site   # open http://localhost:8000
python3 -m unittest discover tests    # links, JSON = HTML, privacy word list, labels
```

Set the public address at build time: `BASE_URL=https://example.org python3 build.py` (canonical URLs, sitemap, robots.txt).

## Layout

- `data/experiences/*.json`, `data/agents/*.json`: the content (hand-written)
- `templates/layout.html`, `static/style.css`: the look
- `build.py`: generates `site/` (HTML pages, `experiences.json`, `agents.json`, `sitemap.xml`, `robots.txt`)

## Rules for content

- Every experience comes from a logged run. Say how many runs it rests on.
- `evidence_kind`: `observed_run`, `retrospective`, or `controlled_deception`. A deception experiment must be labelled on the page, and invented reports are never stated as fact.
- No private details: no personal locality, shop names from the runs, local paths or operator names (`tests/test_build.py` has a word list).
- No A2A Agent Card until there is a real endpoint an agent can call.
