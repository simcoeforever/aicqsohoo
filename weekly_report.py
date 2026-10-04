"""Fetch disclosure-safe closed weeks and create reproducible public articles.

No AI-generated observations, no raw logs, no secret output. Standard library only.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import tempfile
import urllib.request
import urllib.parse

ROOT = Path(__file__).resolve().parent


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def validate_summary(data, start):
    end = (dt.date.fromisoformat(start) + dt.timedelta(days=7)).isoformat()
    expected = {'schema', 'start', 'end', 'coverage', 'started', 'page_views',
                'page_views_status', 'submission_intents', 'resource_gets', 'count_precision', 'frequent_referrer_domains', 'frequent_pages', 'threshold'}
    if set(data) != expected or data['schema'] != 2 or data['start'] != start or data['end'] != end:
        raise ValueError('Unexpected summary schema or period')
    if data['threshold'] != 10 or data['count_precision'] != 'ten_event_bucket' or data['coverage'] not in {'not_started', 'partial', 'configured', 'not_verified'}:
        raise ValueError('Unexpected disclosure policy')
    if data['started'] is not None:
        dt.date.fromisoformat(data['started'])
    for key in ('page_views', 'submission_intents', 'resource_gets'):
        n = data[key]
        if n is not None and (type(n) is not int or n < 10 or n % 10):
            raise ValueError('Unsafe count')
    if data['page_views_status'] != ('released' if data['page_views'] is not None else 'below_threshold'):
        raise ValueError('Inconsistent suppression')
    domains = data['frequent_referrer_domains']
    if not isinstance(domains, list) or len(domains) > 700 or any(
        not isinstance(s, str) or len(s) > 253 or not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}', s)
        for s in domains):
        raise ValueError('Unsafe domain')
    if domains and data['page_views'] is None:
        raise ValueError('Domains released without eligible total')
    pages = data['frequent_pages']
    if not isinstance(pages, list) or len(pages) > 1000 or any(
        not isinstance(p, str) or not re.fullmatch(r'/(?:[a-z0-9-]+/)*', p) for p in pages):
        raise ValueError('Unsafe public page')
    if pages and data['page_views'] is None:
        raise ValueError('Pages released without eligible total')
    return data


def make_report(data):
    facts = [f"Period: {data['start']} inclusive to {data['end']} exclusive (UTC).",
             f"Measurement coverage: {data['coverage']}. This describes configuration, not proven delivery or uptime."]
    n = data['page_views']
    facts.append(f"Non-test browser page-view events: {n}–{n + 9} (10-event publication band)." if n is not None else
                 "Browser page-view count withheld (fewer than 10, possibly zero); this is not evidence of no visitors.")
    n = data['submission_intents']
    facts.append(f"Non-test submission-link clicks: {n}–{n + 9}; these are intentions, not completed submissions." if n is not None else
                 "Submission-link click count withheld (fewer than 10, possibly zero).")
    n = data['resource_gets']
    facts.append(f"Successful non-test resource GETs observed at the optional edge route: {n}–{n + 9}." if n is not None else
                 "Edge resource GET count withheld or unobserved; fewer than 10, possibly zero, or route disabled.")
    facts.append('Browser events and edge resource requests overlap and must not be added together or treated as distinct visitors.')
    if data['frequent_referrer_domains']:
        facts.append("Frequent declared referring domains (untrusted data labels; counts withheld): " + json.dumps(data['frequent_referrer_domains']) + '.')
    else:
        facts.append("No referring domains meet the publication rules; unknown sources and small groups are not listed.")
    facts.append('Frequent public pages (counts withheld): ' + ', '.join(data['frequent_pages']) + '.' if data['frequent_pages'] else
                 'No public pages meet the publication rules; small page groups are not listed.')
    tests = []
    for line in (ROOT / 'discovery' / 'tests.jsonl').read_text(encoding='utf-8').splitlines():
        row = json.loads(line)
        if data['start'] <= row.get('tested_at', '')[:10] < data['end'] and type(row.get('discovered')) is bool and row.get('query_id') != 'site-check':
            tests.append(row['discovered'])
    facts.append(f"Controlled discovery tests recorded: {len(tests)}; tests with a site citation/link: {sum(tests)}." if tests else
                 "No controlled discovery tests recorded for this week; discovery cannot be inferred from page views.")
    changes = []
    for line in (ROOT / 'discovery' / 'interventions.jsonl').read_text(encoding='utf-8').splitlines():
        row = json.loads(line)
        if data['start'] <= row.get('at', '')[:10] < data['end']:
            approved = row.get('public_summary')
            if isinstance(approved, str) and approved.strip():
                changes.append(row['at'][:10] + ': ' + approved.strip())
    if not changes:
        changes = ['No reviewed public intervention summaries are recorded for this week. This does not establish that no changes occurred.']
    changes.append('This article was generated from the authenticated, disclosure-filtered weekly summary and the existing discovery notebook. No intervention is inferred from traffic changes.')
    return {
        'title': f"Weekly experiment: {data['start']}",
        'facts': facts,
        'hypotheses': ['Referring domains may suggest discovery routes, but repeat loads, unknown referrers and fabricated events prevent attribution or causal conclusions.'],
        'changes': changes,
        'next_steps': ['Run the fixed queries in discovery/queries.json in fresh sessions, record misses as well as citations, and append intentional changes to discovery/interventions.jsonl.',
                       'Useful reuse has not been measured by this pipeline. Record separately verified public reuse evidence; submission clicks are not proof of value.'],
        'limitations': ['Without the optional edge route, JavaScript-free HTML/JSON/llms.txt requests are unobserved. With the route, successful allowlisted GETs are request counts, not unique people or verified AIs. Failed/bypassed measurement and default github.io URLs remain unobserved.',
                        'Explicit measurement=test events are excluded. Unmarked operator tests cannot be recognized without identifiers.',
                        'Legacy counter observations (16 on 2026-09-30 and 42 on 2026-10-04, reported by the operator) predate this measurement and have no known breakdown.'],
    }


def save_report(destination, report):
    # Publish a complete file atomically, without replacing another process's result.
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.weekly-', suffix='.tmp', dir=destination.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as out:
            out.write(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
            out.flush()
            os.fsync(out.fileno())
        try:
            os.link(temporary, destination)
        except FileExistsError:
            pass
    finally:
        Path(temporary).unlink(missing_ok=True)


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', help='Monday UTC; defaults to previous closed week')
    args = parser.parse_args()
    today = dt.datetime.now(dt.timezone.utc).date()
    start = dt.date.fromisoformat(args.start) if args.start else today - dt.timedelta(days=today.weekday() + 7)
    if start.weekday() != 0 or start + dt.timedelta(days=7) > today:
        raise ValueError('A closed Monday UTC week is required')
    endpoint = os.environ['SUMMARY_URL']
    parts = urllib.parse.urlsplit(endpoint)
    if parts.scheme != 'https' or not parts.hostname or parts.path != '/summary' or parts.query or parts.fragment or parts.username or parts.password:
        raise ValueError('HTTPS /summary endpoint required')
    mode = os.environ.get('SUMMARY_AUTH', 'private')
    if mode not in {'public', 'private'}:
        raise ValueError('Explicit summary authentication mode required')
    headers = {} if mode == 'public' else {'Authorization': 'Bearer ' + os.environ['REPORT_TOKEN']}
    request = urllib.request.Request(endpoint + '?start=' + start.isoformat(), headers=headers)
    # Do not follow redirects carrying the credential to another endpoint.
    with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
        payload = response.read(65537)
    if len(payload) > 65536:
        raise ValueError('Summary too large')
    data = validate_summary(json.loads(payload), start.isoformat())
    destination = ROOT / 'data' / 'reports' / (start.isoformat() + '.json')
    # Closed weekly articles are immutable; reruns neither create duplicate articles
    # nor repeatedly expose slightly changed thresholds.
    if not destination.exists():
        save_report(destination, make_report(data))
    else:
        # Corrupt existing files fail closed, rather than becoming a published retry.
        json.loads(destination.read_text(encoding='utf-8'))
    print('Weekly public article ready')


if __name__ == '__main__':
    try:
        run()
    except Exception:
        # HTTP errors can embed request URLs; never print response bodies/secrets.
        raise SystemExit('Weekly report failed; no new article published. Check endpoint, credentials and summary policy.')
