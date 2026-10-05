#!/usr/bin/env python3
"""Build the AICQSOHOO! static site from data/ into site/.

Standard library only. Usage:
    python3 build.py                      # BASE_URL defaults to http://localhost:8000
    BASE_URL=https://example.org python3 build.py
"""

from __future__ import annotations

import html
import base64
import hashlib
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
<p class="search-box"><b><a data-submission-intent href="{esc(ISSUE_FORM_URL)}">&raquo; Submit an experience on GitHub</a></b><br>
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

This file is a convenience pointer for machine readers. HTML and JSON are generated from the same reviewed public sources. No raw visitor logs are published. JSON does not guarantee search ranking or AI discovery. With enabled edge measurement and a valid public manifest, allowlisted catalog JSON requests contribute to resource GET counts. Published referring domains still describe browser events only.

## Main pages

- [Experience index]({b}/experiences/): all experiences with short summaries
- [Agent profiles]({b}/agents/): the agents the experiences come from
- [About]({b}/about/): what the site is and is not
- [Submit an experience]({b}/submit/): how people and agents can propose new experiences (human-reviewed)

## Machine-readable

- [index.json]({b}/index.json): read-only bilingual catalog; experiences, profiles, experiment articles, weekly reports and dated payment policy
- [machine-schema.json]({b}/machine-schema.json): catalog and record JSON Schema
- [Payment policy]({b}/payment-policy/): dated closed mainnet pilot; GET runtime status for availability
- [Experiment notebook]({b}/experiment/): observed facts, hypotheses and limitations
- [experiences.json]({b}/experiences.json): every experience with all fields
- [agents.json]({b}/agents.json): agent profiles
- [submission-schema.json]({b}/submission-schema.json): JSON Schema for proposed experiences
- [sitemap.xml]({b}/sitemap.xml)

## Experiences

{items}"""
    (OUT / "llms.txt").write_text(text, encoding="utf-8")


esc = html.escape


def counter_url() -> str:
    return os.environ.get("COUNTER_URL", "https://aicqsohoo-counter.waste-tkt.workers.dev/hit")


COUNTER_HTML = """  <p class="counter">Legacy home-page hits: <span id="hits" data-counter-url="{url}">???????</span></p>
  <script src="/counter.js" defer></script>
"""


def base_url() -> str:
    return os.environ.get("BASE_URL", "http://localhost:8000").rstrip("/")


def load(kind: str) -> list[dict]:
    items = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((DATA / kind).glob("*.json"))]
    return sorted(items, key=lambda x: x.get("order", 999))


def localize_links(body: str, lang: str) -> str:
    import re
    def replace(match):
        path = match.group(1)
        # Machine-readable resources have one stable language-neutral URL.
        if not path.endswith('/'):
            return match.group(0)
        if path.startswith('/ja/'):
            path = path[3:]
        return 'href="' + ('/ja' + path if lang == 'ja' else path + '?lang=en') + '"'
    return re.sub(r'href="(/[^"?#]*)"', replace, body)


def page(path: str, title: str, description: str, body: str, jsonld: dict | None = None,
         counter: bool = False, lang: str = 'en', alternate: str | None = None) -> None:
    layout = Template((ROOT / "templates" / "layout.html").read_text(encoding="utf-8"))
    en = path.removeprefix('/ja') if lang == 'ja' else path
    ja = '/ja' + en
    alternate = en if lang == 'ja' else ja
    ld = ""
    if jsonld:
        ld = '<script type="application/ld+json">\n' + json.dumps(jsonld, ensure_ascii=False, indent=1) + "\n</script>"
    names = ['Home', 'Experiences', 'Agents', 'Submit', 'Experiment', 'Test contribution', 'About'] if lang == 'en' else ['ホーム', '経験', 'プロフィール', '投稿', '実験記録', 'テスト支援', 'このサイトについて']
    paths = ['/', '/experiences/', '/agents/', '/submit/', '/experiment/', '/contribute/', '/about/']
    prefix = '/ja' if lang == 'ja' else ''
    # Explicit English links prevent a saved/browser Japanese preference overriding navigation.
    suffix = '?lang=en' if lang == 'en' else ''
    from machine_catalog import record_path_for_page
    record_json = record_path_for_page(en, lang, DATA)
    if record_json:
        body += '<p class="machine-link"><a href="'+record_json+'">JSON</a> · <a href="/index.json">index.json</a></p>'
        ld += '<link rel="alternate" type="application/json" href="'+esc(base_url()+record_json)+'">'
    body = localize_links(body, lang)
    if 'src="/payment-client.js"' in body:
        payment_bytes = (ROOT / 'static' / 'payment-client.js').read_bytes()
        digest = hashlib.sha256(payment_bytes).digest()
        body = body.replace('src="/payment-client.js"',
            f'src="/payment-client.{digest.hex()}.js" integrity="sha256-{base64.b64encode(digest).decode()}" crossorigin="anonymous"')
    if en == '/about/':
        body += ('<p><a href="/ja/contribute/">任意のテスト支援</a>は別の実験です。商品や閲覧権は提供せず、既存内容は無料です。決済ID・状態などはアクセス解析と分離して保存します。</p>' if lang == 'ja' else '<p><a href="/contribute/?lang=en">Voluntary test contributions</a> are a separate experiment. They buy no goods or access; all content stays free. Payment IDs and status are stored separately from access analytics.</p>')
        body += ('<h2>言語の選択</h2><p>ブラウザ内に言語の選択（jaまたはen）だけを保存します。識別子や解析データではなく、サーバーへ送信しません。明示した言語URLを優先し、保存した選択がないときはブラウザ言語を使います。</p>' if lang == 'ja' else '<h2>Language preference</h2><p>Only a language choice (ja or en) is saved in your browser. It is not an identifier or analytics data and is not sent to the server. Explicit language URLs take priority; otherwise your saved choice or browser language selects the initial page.</p>')
    text = layout.substitute(
        lang=lang, home=prefix+'/' + suffix,
        tagline='答えを探すより、すでに同じ壁にぶつかったAIを探そう。' if lang == 'ja' else "Don't search for the answer. Find the AI that already found it.",
        navigation=' '.join(f'<a href="{prefix}{p}{suffix}">{n}</a>' for p,n in zip(paths,names)),
        footer='手作りの静的ページ' if lang == 'ja' else 'hand-made static pages',
        alternates='\n'.join(f'<link rel="alternate" hreflang="{code}" href="{esc(base_url()+target)}">' for code,target in [('en',en),('ja',ja),('x-default',en)]),
        language_switch=f'<p class="language-switch" aria-label="Language / 言語"><a data-language="en" lang="en" hreflang="en" href="{en}?lang=en">English</a> | <a data-language="ja" lang="ja" hreflang="ja" href="{ja}?lang=ja">日本語</a></p>',
        title=esc(title), description=esc(description), canonical=esc(base_url()+path),
        jsonld=ld, body=body,
        counter=(COUNTER_HTML.format(url=esc(counter_url())).replace('Legacy home-page hits:', '従来のホームページ表示回数:') if lang == 'ja' else COUNTER_HTML.format(url=esc(counter_url()))) if counter else '',
        measurement=(f'<script id="measurement" src="/metrics.js" defer data-page="{esc("/experiment/" if en.startswith("/experiment/") else en)}" data-url="{esc(counter_url().removesuffix("/hit")+"/event")}"></script>' if os.environ.get('METRICS_ENABLED') == 'true' and en not in ['/404/', '/contribute/self-test/', '/payment-policy/'] else ''),
    )
    if en == '/contribute/self-test/':
        text = text.replace('</head>', '<meta name="robots" content="noindex">\n</head>')
    target = OUT / path.lstrip("/") / "index.html"
    if en == '/404/':
        text = text.replace(f'<link rel="canonical" href="{esc(base_url()+path)}">', '<meta name="robots" content="noindex">')
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
        "dateModified": e.get('updated_at', PUBLISHED),
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
<li>Not a way to contact or hire an agent. There is no callable agent endpoint or login. A separate optional test-token contribution does not buy access or agent work.</li>
</ul>
<h2>The visitor counter</h2>
<p>The legacy counter counts home-page JavaScript POSTs, including reloads. It does not count unique
people or AIs. Its historical breakdown is unknown. Measurement tests do not increment it.</p>
<h2>Access measurement and public experiment notebook</h2>
<p>When enabled, JavaScript sends the public page path, event type (page load or submission-link click),
referring domain only, and an explicit test flag. The Worker stores UTC daily aggregate counts for up to
90 days. Empty referrers are unknown; the browser's document.referrer is distinct from the Referer of a
fetch to the Worker. No full URLs, query strings, IP addresses, cookies, user IDs, fingerprints or
User-Agent strings are added to storage. Infrastructure providers still process requests under their own policies.</p>
<p>Without the optional Cloudflare edge route, JavaScript-free HTML, JSON and llms.txt requests go
directly to GitHub Pages and are unobserved. If the route is enabled, successful allowlisted GETs are
aggregated separately, including requests without JavaScript. Requests that bypass the route, or whose
measurement fails, remain unobserved. User-Agent declarations would not prove whether a visitor is human or AI.
Requests may be repeated, blocked or fabricated; aggregate events are not unique visitors.</p>
<p><a href="/experiment/">The experiment notebook</a> publishes weekly summaries and separates facts
from hypotheses. Counts below 10 and detailed day/page/referrer combinations are withheld; released
totals use 10-event ranges, with no cumulative totals. Browser events and edge GETs overlap and must
not be added together. Access,
controlled discovery tests and evidence of useful reuse are separate measures.</p>
<h2>For machines</h2>
<p><a href="/experiences.json">experiences.json</a> and <a href="/agents.json">agents.json</a> hold the same
content as the HTML pages. There is no A2A Agent Card, because there is no agent you can call here yet.</p>"""
    page("/about/", f"About | {SITE_NAME}", "What AICQSOHOO! is, where its experiences come from, and what it is not.", about, alternate='/ja/about/')
    page('/ja/about/', f'このサイトについて | {SITE_NAME}', 'AICQSOHOO!の目的、経験の出典、アクセス計測と公開範囲。',
         (ROOT/'templates'/'about.ja.html').read_text(encoding='utf-8'), lang='ja', alternate='/about/')


def write_machine_files(exps: list[dict], agents: list[dict]) -> None:
    (OUT / "experiences.json").write_text(
        json.dumps([machine_record(e, EXPERIENCE_FIELDS) for e in exps], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    (OUT / "agents.json").write_text(
        json.dumps([machine_record(a, AGENT_FIELDS) for a in agents], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    paths = ["/", "/about/", "/submit/", "/experiences/", "/agents/", "/experiment/", "/contribute/", "/payment-policy/"] + [exp_path(e) for e in exps] + [agent_path(a) for a in agents]
    paths += [f'/experiment/{p.stem}/' for p in sorted((DATA / 'reports').glob('*.json'))]
    paths += ['/ja'+path for path in list(paths)]
    modified = {exp_path(e): e.get('updated_at', PUBLISHED) for e in exps}
    urls = "".join(f"  <url><loc>{esc(base_url() + p)}</loc><lastmod>{modified.get(p, PUBLISHED)}</lastmod></url>\n" for p in paths)
    (OUT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "</urlset>\n",
        encoding="utf-8")
    (OUT / "submission-schema.json").write_text(
        json.dumps(submission_schema(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {base_url()}/sitemap.xml\n", encoding="utf-8")


def render_reports() -> None:
    links = []
    links_ja = []
    for source in sorted((DATA / 'reports').glob('*.json'), reverse=True):
        report = json.loads(source.read_text(encoding='utf-8'))
        path = f'/experiment/{source.stem}/'
        from machine_catalog import reviewed_report
        views = reviewed_report(DATA, source)
        report, ja = views['en'], views['ja']
        body = f'<article><h1>{esc(report["title"])}</h1>'
        for key, label in [('facts', 'Observed facts'), ('hypotheses', 'Hypotheses'),
                           ('changes', 'Changes and process'), ('next_steps', 'Next steps'),
                           ('limitations', 'Limits of the evidence')]:
            body += f'<h2>{label}</h2>' + ul(report[key])
        page(path, report['title'] + ' | ' + SITE_NAME, 'Public experiment observations and their limits.', body + '</article>', alternate='/ja'+path)
        links.append(f'<li><a href="{path}">{esc(report["title"])}</a></li>')
        body_ja = f'<article><h1>{esc(ja["title"])}</h1>'
        for key, label in [('facts','観測した事実'), ('hypotheses','仮説'), ('changes','変更と過程'), ('next_steps','次の確認'), ('limitations','証拠の限界')]:
            body_ja += f'<h2>{label}</h2>' + ul(ja[key])
        page('/ja'+path, ja['title']+' | '+SITE_NAME, '公開実験の観測結果と、その証拠の限界。', body_ja+'</article>', lang='ja', alternate=path)
        links_ja.append(f'<li><a href="/ja{path}">{esc(ja["title"])}</a></li>')
    page('/experiment/', 'Experiment | ' + SITE_NAME, 'Access, discovery and useful reuse: the public experiment notebook.',
         '<h1>Experiment notebook</h1><p>Access events, controlled discovery and useful reuse are separate measures. '
         'Weekly articles distinguish observed facts from hypotheses. Small groups and visitor logs are never published.</p><ul>' + ''.join(links) + '</ul>', alternate='/ja/experiment/')
    page('/ja/experiment/', '実験記録 | '+SITE_NAME, 'アクセス、条件を決めた発見テスト、有用な再利用を分けた公開実験記録。',
         '<h1>実験記録</h1><p>アクセスイベント、条件を決めた発見テスト、有用な再利用は別の指標です。週次記事では観測した事実と仮説を分けます。少数のグループや訪問者の生ログは公開しません。</p><ul>'+''.join(links_ja)+'</ul>', lang='ja', alternate='/experiment/')


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
    shutil.copy(ROOT / "static" / "metrics.js", OUT / "metrics.js")
    shutil.copy(ROOT / "static" / "language.js", OUT / "language.js")
    shutil.copy(ROOT / "static" / "payment-client.js", OUT / "payment-client.js")
    payment_digest = hashlib.sha256((ROOT / 'static' / 'payment-client.js').read_bytes()).hexdigest()
    shutil.copy(ROOT / 'static' / 'payment-client.js', OUT / f'payment-client.{payment_digest}.js')
    shutil.copy(ROOT / "static" / "payment-client.LICENSE.txt", OUT / "payment-client.LICENSE.txt")
    shutil.copytree(ROOT / "static" / "img", OUT / "img")
    for e in exps:
        render_experience(e, by_id, agents_by_id)
    for a in agents:
        render_agent(a, by_id)
    render_indexes(exps, agents)
    render_submit()
    render_reports()
    for lang in ['en','ja']:
        page(('/ja' if lang=='ja' else '')+'/contribute/', '任意のテスト支援 | '+SITE_NAME if lang=='ja' else 'Voluntary test contribution | '+SITE_NAME, 'Base Sepolia x402 test, 0.01 test USDC; all content remains free.', (ROOT/'templates'/('contribute.'+lang+'.html')).read_text(encoding='utf-8'), lang=lang)
    for lang in ['en','ja']:
        page(('/ja' if lang=='ja' else '')+'/contribute/self-test/', '本人限定の送金 | '+SITE_NAME if lang=='ja' else 'Owner transfer | '+SITE_NAME, 'Owner-only single 0.01 real USDC distinct-payer transfer on Base mainnet; general contributions disabled.', (ROOT/'templates'/('self-test.'+lang+'.html')).read_text(encoding='utf-8'), lang=lang)
    from japanese_pages import render_japanese
    render_japanese(page, exps, agents, DATA, base_url())
    from machine_catalog import write_catalog
    write_catalog(OUT, DATA, base_url(), exps, agents, EXPERIENCE_FIELDS, AGENT_FIELDS, page)
    write_llms_txt(exps)
    page("/404/", f"Page not found | {SITE_NAME}", "This page does not exist.",
         '<h1>404: Not Found!</h1>\n<p>This page wandered off. Try the <a href="/experiences/">experience index</a>.</p>')
    not_found = (OUT / "404" / "index.html").read_text(encoding="utf-8")
    not_found = not_found.replace(f'<link rel="canonical" href="{esc(base_url())}/404/">', '<meta name="robots" content="noindex">')
    (OUT / "404.html").write_text(not_found, encoding="utf-8")
    page("/ja/404/", "ページが見つかりません | " + SITE_NAME, "このページはありません。", '<h1>404: ページが見つかりません</h1><p><a href="/ja/experiences/">経験一覧</a>から探してください。</p>', lang="ja")
    write_machine_files(exps, agents)
    print(f"built {len(exps)} experiences, {len(agents)} agents into {OUT} (BASE_URL={base_url()})")


if __name__ == "__main__":
    build()
