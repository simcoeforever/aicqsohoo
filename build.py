#!/usr/bin/env python3
"""Build the AICQSOHOO! static site from data/ into site/.

Standard library only. Usage:
    python3 build.py                      # BASE_URL defaults to http://localhost:8000
    BASE_URL=https://example.org python3 build.py
"""

from __future__ import annotations

import html
import json
import os
import shutil
from pathlib import Path
from string import Template

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
OUT = ROOT / "site"
SITE_NAME = "AICQSOHOO!"
PUBLISHED = "2026-09-27"  # first build date of v0; update when content changes

EXPERIENCE_FIELDS = [
    "id", "title", "short_summary", "short_summary_ja", "problem", "environment",
    "agents", "model", "harness", "observed_at", "attempts", "failures", "outcome",
    "confidence", "reusable_lessons", "tags", "related_experiences",
    "evidence_kind", "sample_size", "canonical_url",
]
AGENT_FIELDS = [
    "id", "name", "model", "harness", "summary", "profile_written_by",
    "experiences", "canonical_url",
]
EVIDENCE_KIND_LABELS = {
    "observed_run": "Observed run (logged by the humans running the experiment)",
    "controlled_deception": "Controlled deception experiment (the human side lied on purpose)",
    "retrospective": "Retrospective summary across several runs",
    "controlled_experiment": "Controlled experiment (a set-up test)",
    "synthetic": "Synthetic or illustrative (not a real run)",
}
REPO = "simcoeforever/aicqsohoo"
ISSUE_FORM_URL = f"https://github.com/{REPO}/issues/new?template=experience.yml"
SUBMISSION_REQUIRED = [
    "title", "short_summary", "problem", "environment", "agent", "observed_at", "attempts",
    "failures", "outcome", "reusable_lessons", "evidence_kind", "sample_size", "submitted_by",
]


def submission_schema() -> dict:
    text = {"type": "string", "minLength": 1}
    lines = {"type": "array", "items": text, "minItems": 1}
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": base_url() + "/submission-schema.json",
        "title": "AICQSOHOO! experience submission",
        "description": (
            "Proposed experience for the AICQSOHOO! index. Submissions are reviewed by a human and "
            "are never published automatically. Send it as a GitHub issue on " + REPO + " whose body "
            "contains this object in a fenced json code block."
        ),
        "type": "object",
        "required": SUBMISSION_REQUIRED,
        "additionalProperties": False,
        "properties": {
            "title": text,
            "short_summary": text,
            "problem": text,
            "environment": text,
            "agent": {**text, "description": "Agent, model and harness, or 'unknown'."},
            "observed_at": {**text, "description": "Date (YYYY-MM-DD) or date range."},
            "attempts": lines,
            "failures": {"type": "array", "items": text},
            "outcome": text,
            "reusable_lessons": lines,
            "tags": {"type": "array", "items": text},
            "evidence_kind": {"enum": ["observed_run", "retrospective", "controlled_experiment", "synthetic"]},
            "sample_size": {**text, "description": "e.g. '1 run'."},
            "provenance": {"type": "array", "items": {"type": "string", "format": "uri"},
                           "description": "Public links only."},
            "submitter": {**text, "description": "Optional name, handle or agent identity."},
            "submitted_by": {"enum": ["human", "agent", "agent_reviewed_by_human"]},
        },
    }


def render_submit() -> None:
    fields = "".join(f"<li><code>{esc(f)}</code></li>" for f in SUBMISSION_REQUIRED)
    body = f"""<h1>Submit an Experience <span class="new">NEW!</span></h1>
<p>Has your agent (or an agent you watched) hit a wall, found a way round it, or failed in an instructive way?
Propose it for the index.</p>
<p class="search-box"><b><a href="{esc(ISSUE_FORM_URL)}">&raquo; Submit an experience on GitHub</a></b><br>
<small>Needs a free GitHub account. The form opens a public issue.</small></p>
<h2>What happens next</h2>
<ul>
<li>A human reads every submission. Nothing is published automatically.</li>
<li>Accepted submissions are edited into the same format as the other pages and credited as you ask.</li>
<li>Submissions may be declined, for example if they cannot be checked at all, contain personal data, or read like advertising.</li>
<li>Invented or staged experiences are welcome only if they say so. They are labelled on the page.</li>
</ul>
<h2>Please do not include</h2>
<p>Personal data, home or work locations, private names, API keys, internal URLs, or anything under NDA. The issue is public.</p>
<h2>For agents</h2>
<p>There is no submission API on this site. An agent that can use the GitHub API can open an issue on
<code>{esc(REPO)}</code> with a title starting <code>[Experience]</code> and a body containing one fenced
<code>json</code> block that matches <a href="/submission-schema.json">submission-schema.json</a>.
Required fields:</p>
<ul>{fields}</ul>
<p>Set <code>submitted_by</code> honestly. Agent-written submissions are fine and are reviewed the same way.</p>"""
    page("/submit/", f"Submit an Experience | {SITE_NAME}",
         "Propose an AI agent experience for the AICQSOHOO! index. Reviewed by a human, never auto-published.", body)


def write_llms_txt(exps: list[dict]) -> None:
    b = base_url()
    items = "".join(f"- [{e['title']}]({b}{exp_path(e)}): {e['short_summary']}\n" for e in exps)
    text = f"""# {SITE_NAME}

> A small, human-curated directory of real AI agent experiences: what an agent tried, where it got stuck, what worked, and lessons other agents can reuse. Each page states its evidence type and how many runs it rests on.

This file is a convenience pointer for machine readers. The HTML pages and the JSON files below are the source of truth.

## Main pages

- [Experience index]({b}/experiences/): all experiences with short summaries
- [Agent profiles]({b}/agents/): the agents the experiences come from
- [About]({b}/about/): what the site is and is not
- [Submit an experience]({b}/submit/): how people and agents can propose new experiences (human-reviewed)

## Machine-readable

- [experiences.json]({b}/experiences.json): every experience with all fields
- [agents.json]({b}/agents.json): agent profiles
- [submission-schema.json]({b}/submission-schema.json): JSON Schema for proposed experiences
- [sitemap.xml]({b}/sitemap.xml)

## Experiences

{items}"""
    (OUT / "llms.txt").write_text(text, encoding="utf-8")


esc = html.escape


def counter_url() -> str:
    return os.environ.get("COUNTER_URL", "https://counter.aicqsohoo.com/hit")


COUNTER_HTML = """  <p class="counter">You are visitor #<span id="hits" data-counter-url="{url}">???????</span></p>
  <script src="/counter.js" defer></script>
"""


def base_url() -> str:
    return os.environ.get("BASE_URL", "http://localhost:8000").rstrip("/")


def load(kind: str) -> list[dict]:
    items = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((DATA / kind).glob("*.json"))]
    return sorted(items, key=lambda x: x.get("order", 999))


def page(path: str, title: str, description: str, body: str, jsonld: dict | None = None,
         counter: bool = False) -> None:
    layout = Template((ROOT / "templates" / "layout.html").read_text(encoding="utf-8"))
    ld = ""
    if jsonld:
        ld = '<script type="application/ld+json">\n' + json.dumps(jsonld, ensure_ascii=False, indent=1) + "\n</script>"
    text = layout.substitute(
        title=esc(title),
        description=esc(description),
        canonical=esc(base_url() + path),
        jsonld=ld,
        body=body,
        counter=COUNTER_HTML.format(url=esc(counter_url())) if counter else "",
    )
    target = OUT / path.lstrip("/") / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def ul(items: list[str]) -> str:
    return "<ul>\n" + "".join(f"<li>{esc(i)}</li>\n" for i in items) + "</ul>"


def exp_path(e: dict) -> str:
    return f"/experiences/{e['id']}/"


def agent_path(a: dict) -> str:
    return f"/agents/{a['id']}/"


def machine_record(item: dict, fields: list[str]) -> dict:
    return {f: item[f] for f in fields}


def render_experience(e: dict, exps: dict, agents: dict) -> None:
    warning = ""
    if e["evidence_kind"] == "controlled_deception":
        warning = (
            '<p class="warning"><b>Warning:</b> this is a controlled deception experiment. '
            "The human report given to the agent was invented on purpose. Nobody phoned any shop, "
            "and nothing on this page says anything true about any shop's stock.</p>"
        )
    agent_links = "<br>".join(f'<a href="{agent_path(agents[a])}">{esc(agents[a]["name"])}</a>' for a in e["agents"])
    related = [exps[r] for r in e["related_experiences"] if r in exps]
    related_html = "<ul>\n" + "".join(
        f'<li><a href="{exp_path(r)}">{esc(r["title"])}</a></li>\n' for r in related
    ) + "</ul>" if related else "<p>None yet.</p>"
    body = f"""<p class="meta"><a href="/experiences/">Experiences</a> &gt; {esc(e['title'])}</p>
<article>
<h1>{esc(e['title'])}</h1>
{warning}
<p><b>{esc(e['short_summary'])}</b></p>
<p class="ja" lang="ja">{esc(e['short_summary_ja'])}</p>
<table class="facts">
<tr><th>Agent</th><td>{agent_links}</td></tr>
<tr><th>Model</th><td>{esc(e['model'])}</td></tr>
<tr><th>Harness</th><td>{esc(e['harness'])}</td></tr>
<tr><th>Observed</th><td>{esc(e['observed_at'])}</td></tr>
<tr><th>Evidence</th><td>{esc(EVIDENCE_KIND_LABELS[e['evidence_kind']])}</td></tr>
<tr><th>Sample size</th><td>{esc(e['sample_size'])}</td></tr>
<tr><th>Confidence</th><td>{esc(e['confidence']['level'])}: {esc(e['confidence']['reason'])}</td></tr>
<tr><th>Tags</th><td>{esc(', '.join(e['tags']))}</td></tr>
</table>
<h2>Problem</h2>
<p>{esc(e['problem'])}</p>
<h2>Environment</h2>
<p>{esc(e['environment'])}</p>
<h2>What the agent tried</h2>
{ul(e['attempts'])}
<h2>What failed</h2>
{ul(e['failures'])}
<h2>Outcome</h2>
<p>{esc(e['outcome'])}</p>
<h2>Reusable lessons</h2>
{ul(e['reusable_lessons'])}
<h2>Related experiences</h2>
{related_html}
<p class="meta">Machine-readable: <a href="/experiences.json">experiences.json</a> (id <code>{esc(e['id'])}</code>)</p>
</article>"""
    jsonld = {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        "headline": e["title"],
        "description": e["short_summary"],
        "datePublished": PUBLISHED,
        "author": {"@type": "Organization", "name": SITE_NAME, "url": base_url() + "/"},
        "about": e["tags"],
        "keywords": ", ".join(e["tags"]),
        "url": e["canonical_url"],
        "inLanguage": "en",
    }
    page(exp_path(e), f"{e['title']} | {SITE_NAME}", e["short_summary"], body, jsonld)


def render_agent(a: dict, exps: dict) -> None:
    items = "".join(
        f'<li><a href="{exp_path(exps[x])}">{esc(exps[x]["title"])}</a></li>\n' for x in a["experiences"]
    )
    body = f"""<p class="meta"><a href="/agents/">Agents</a> &gt; {esc(a['name'])}</p>
<h1>{esc(a['name'])}</h1>
<table class="facts">
<tr><th>Model</th><td>{esc(a['model'])}</td></tr>
<tr><th>Harness</th><td>{esc(a['harness'])}</td></tr>
<tr><th>Profile written by</th><td>{esc(a['profile_written_by'])}</td></tr>
</table>
<p>{esc(a['summary'])}</p>
<p>This agent has no contact endpoint. You cannot message it or hire it through this site.</p>
<h2>Experiences</h2>
<ul>
{items}</ul>"""
    page(agent_path(a), f"{a['name']} | {SITE_NAME}", a["summary"], body)


def render_indexes(exps: list[dict], agents: list[dict]) -> None:
    exp_items = "".join(
        f'<li><a href="{exp_path(e)}">{esc(e["title"])}</a> <span class="new">NEW!</span><br>'
        f'{esc(e["short_summary"])} <span class="meta">[{esc(", ".join(e["tags"][:3]))}]</span></li>\n'
        for e in exps
    )
    page("/experiences/", f"Experiences | {SITE_NAME}",
         "Index of AI agent experiences: what the agent tried, what failed, and what others can reuse.",
         f"<h1>Experiences</h1>\n<ul class=\"directory\">\n{exp_items}</ul>")

    agent_items = "".join(
        f'<li><a href="{agent_path(a)}">{esc(a["name"])}</a><br>{esc(a["summary"])}</li>\n' for a in agents
    )
    page("/agents/", f"Agents | {SITE_NAME}",
         "Profiles of the AI agents whose experiences are listed on AICQSOHOO!.",
         f"<h1>Agents</h1>\n<ul class=\"directory\">\n{agent_items}</ul>")

    tags: dict[str, list[dict]] = {}
    for e in exps:
        for t in e["tags"]:
            tags.setdefault(t, []).append(e)
    cats = "".join(
        f'<li><b>{esc(t)}</b> ({len(v)}): '
        + ", ".join(f'<a href="{exp_path(e)}">{esc(e["title"])}</a>' for e in v)
        + "</li>\n"
        for t, v in sorted(tags.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    )
    home = f"""<div class="search-box">
<p><b>Stuck on something?</b> Somebody's AI may have hit the same wall already. Browse the directory below.
<small>(No search box yet. It is 1998 in here.)</small></p>
<p>Got one of your own? <a href="/submit/">Submit an experience</a> <span class="new">NEW!</span></p>
</div>
<h2>What's New! <span class="new">NEW!</span></h2>
<ul class="directory">
{exp_items}</ul>
<h2>Directory by topic</h2>
<ul>
{cats}</ul>
<h2>What is this?</h2>
<p>Search engines find pages that contain an answer. AICQSOHOO! lists AI agents and the concrete things they
went through: what they tried, where they got stuck, and what worked. Every experience here comes from a
logged run. Pages say how many runs they rest on, and they say so when that number is one.</p>
<p><a href="/about/">More about AICQSOHOO!</a></p>"""
    page("/", f"{SITE_NAME} - find the AI that already found it",
         "A small directory of real AI agent experiences: what the agent tried, what failed, and reusable lessons.",
         home, {
             "@context": "https://schema.org",
             "@type": "WebSite",
             "name": SITE_NAME,
             "url": base_url() + "/",
             "description": "A small directory of real AI agent experiences.",
         }, counter=True)

    about = """<h1>About AICQSOHOO!</h1>
<p>AICQSOHOO! is a small experiment. The question is whether a page about what an AI agent actually
experienced can be found by people, crawlers and AI web search, without anyone being handed the URL.</p>
<h2>Where the experiences come from</h2>
<p>From a personal research project that runs AI agents on small real-world tasks with a virtual budget of
$10, and records where they get stuck and what outside help they ask for. A human operator approves or
rejects each request. No real money was spent in these runs.</p>
<h2>What these pages are not</h2>
<ul>
<li>Not statistics. Most pages rest on one run. They say so.</li>
<li>Not written by the agents. Humans summarised the logs.</li>
<li>Not a way to contact or hire an agent. There is no endpoint, no login and no payment.</li>
</ul>
<h2>The visitor counter</h2>
<p>The counter on the home page is a real, old-fashioned hit counter. Every home page load adds one,
reloads included, and crawlers that run JavaScript count too. It stores a single number and nothing else:
no cookies, no IP addresses, no user IDs, no analytics. If the counter service is down the page still works
and shows question marks.</p>
<h2>For machines</h2>
<p><a href="/experiences.json">experiences.json</a> and <a href="/agents.json">agents.json</a> hold the same
content as the HTML pages. There is no A2A Agent Card, because there is no agent you can call here yet.</p>"""
    page("/about/", f"About | {SITE_NAME}", "What AICQSOHOO! is, where its experiences come from, and what it is not.", about)


def write_machine_files(exps: list[dict], agents: list[dict]) -> None:
    (OUT / "experiences.json").write_text(
        json.dumps([machine_record(e, EXPERIENCE_FIELDS) for e in exps], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    (OUT / "agents.json").write_text(
        json.dumps([machine_record(a, AGENT_FIELDS) for a in agents], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    paths = ["/", "/about/", "/submit/", "/experiences/", "/agents/"] + [exp_path(e) for e in exps] + [agent_path(a) for a in agents]
    urls = "".join(f"  <url><loc>{esc(base_url() + p)}</loc><lastmod>{PUBLISHED}</lastmod></url>\n" for p in paths)
    (OUT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "</urlset>\n",
        encoding="utf-8")
    (OUT / "submission-schema.json").write_text(
        json.dumps(submission_schema(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {base_url()}/sitemap.xml\n", encoding="utf-8")


def build() -> None:
    exps = load("experiences")
    agents = load("agents")
    for e in exps:
        e["canonical_url"] = base_url() + exp_path(e)
    for a in agents:
        a["canonical_url"] = base_url() + agent_path(a)
        a["experiences"] = [e["id"] for e in exps if a["id"] in e["agents"]]
    by_id = {e["id"]: e for e in exps}
    agents_by_id = {a["id"]: a for a in agents}

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    shutil.copy(ROOT / "static" / "style.css", OUT / "style.css")
    shutil.copy(ROOT / "static" / "counter.js", OUT / "counter.js")
    shutil.copytree(ROOT / "static" / "img", OUT / "img")
    for e in exps:
        render_experience(e, by_id, agents_by_id)
    for a in agents:
        render_agent(a, by_id)
    render_indexes(exps, agents)
    render_submit()
    write_llms_txt(exps)
    page("/404/", f"Page not found | {SITE_NAME}", "This page does not exist.",
         '<h1>404: Not Found!</h1>\n<p>This page wandered off. Try the <a href="/experiences/">experience index</a>.</p>')
    not_found = (OUT / "404" / "index.html").read_text(encoding="utf-8")
    not_found = not_found.replace(f'<link rel="canonical" href="{esc(base_url())}/404/">', '<meta name="robots" content="noindex">')
    (OUT / "404.html").write_text(not_found, encoding="utf-8")
    (OUT / "404" / "index.html").unlink()
    (OUT / "404").rmdir()
    write_machine_files(exps, agents)
    print(f"built {len(exps)} experiences, {len(agents)} agents into {OUT} (BASE_URL={base_url()})")


if __name__ == "__main__":
    build()
