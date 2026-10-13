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
from weekly_i18n import make_japanese_report

ROOT = Path(__file__).resolve().parent


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def validate_summary(data, start):
    end = (dt.date.fromisoformat(start) + dt.timedelta(days=7)).isoformat()
    if not isinstance(data, dict) or type(data.get('schema')) is not int or data['schema'] not in {2, 3}:
        raise ValueError('Unexpected summary schema')
    common = {'schema', 'start', 'end', 'coverage', 'started', 'page_views',
              'submission_intents', 'resource_gets', 'count_precision'}
    exact = data['schema'] == 3
    expected = common | ({'count_origin'} if exact else
                         {'page_views_status', 'frequent_referrer_domains', 'frequent_pages', 'threshold'})
    if set(data) != expected or data['start'] != start or data['end'] != end:
        raise ValueError('Unexpected summary schema or period')
    if data['coverage'] not in {'not_started', 'partial', 'configured', 'not_verified'}:
        raise ValueError('Unexpected coverage')
    if data['started'] is not None:
        dt.date.fromisoformat(data['started'])
    if exact:
        if data['count_precision'] != 'exact_recorded_events' or data['count_origin'] != 'retained_aggregates':
            raise ValueError('Unexpected exact count provenance')
        counts = [data[key] for key in ('page_views', 'submission_intents', 'resource_gets')]
        if any(n is not None and (type(n) is not int or n < 0 or n > 2**53 - 1) for n in counts):
            raise ValueError('Unsafe exact count')
        if any(n is None for n in counts) != all(n is None for n in counts):
            raise ValueError('Inconsistent unavailable totals')
        if data['coverage'] == 'not_started' and any(n is not None for n in counts):
            raise ValueError('Unstarted measurement cannot have known counts')
        if data['coverage'] in {'partial', 'configured'} and any(n is None for n in counts):
            raise ValueError('Recorded coverage requires recorded counts')
        return data
    if data['threshold'] != 10 or data['count_precision'] != 'ten_event_bucket':
        raise ValueError('Unexpected disclosure policy')
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


def apply_editorial_notes(report, start):
    """Only reviewed bilingual prose; measured facts cannot be overridden."""
    source = ROOT / 'discovery' / 'weekly-notes.json'
    if not source.exists():
        return report
    notes = json.loads(source.read_text(encoding='utf-8')).get(start)
    if notes is None:
        return report
    allowed = {'changes', 'hypotheses', 'next_steps', 'limitations'}
    if not isinstance(notes, dict) or set(notes) != {'en', 'ja'}:
        raise ValueError('Bilingual reviewed notes required')
    for language in ('en', 'ja'):
        fields = notes[language]
        if not isinstance(fields, dict) or set(fields) - allowed or not {'changes', 'hypotheses', 'next_steps'} <= set(fields):
            raise ValueError('Editorial notes cannot override observations')
        for values in fields.values():
            if not isinstance(values, list) or not values or any(not isinstance(x, str) or not x.strip() for x in values):
                raise ValueError('Reviewed prose lists required')
    for language in ('en', 'ja'):
        view = report if language == 'en' else report['translations']['ja']
        for key, values in notes[language].items():
            # Reviewed notes replace generic prose; evidence limits remain.
            view[key] = values + view[key] if key == 'limitations' else values
    return report


def make_report(data):
    facts = [f"Period: {data['start']} inclusive to {data['end']} exclusive (UTC).",
             f"Measurement coverage: {data['coverage']}. This describes configuration, not proven delivery or uptime."]
    exact = data.get('schema', 2) == 3
    if exact:
        for key, label in [('page_views', 'Recorded non-test browser page-view events'),
                           ('submission_intents', 'Recorded non-test submission-link clicks'),
                           ('resource_gets', 'Recorded successful non-test resource GETs at the edge')]:
            n = data[key]
            facts.append(f'{label}: {n} (exact recorded events).' if n is not None else
                         f'{label}: unavailable; no retained measurement covering this period is established.')
        facts.append('Exact totals come from a sealed snapshot of retained aggregate counts, not estimates from earlier bands. Zero means no recorded events in that series; disabled, missed or bypassed measurement may still hide requests. Clicks are not completed submissions.')
        facts.append('Only whole-week totals are published in this exact export; no referring-domain, page, daily or test-count breakdown is included.')
        facts.append('Browser events and edge resource requests overlap and must not be added together or treated as distinct visitors.')
    else:
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
        if data['start'] <= row.get('tested_at', '')[:10] < data['end'] and type(row.get('discovered')) is bool and row.get('query_id') != 'site-check' and row.get('observer_knows_target') is not True and row.get('blind_test') is not False:
            tests.append(row['discovered'])
    facts.append(f"Controlled discovery tests recorded: {len(tests)}; tests with a site citation/link: {sum(tests)}." if tests else
                 "No controlled discovery tests recorded for this week; discovery cannot be inferred from page views.")
    changes = []
    interventions = []
    for line in (ROOT / 'discovery' / 'interventions.jsonl').read_text(encoding='utf-8').splitlines():
        row = json.loads(line)
        if data['start'] <= row.get('at', '')[:10] < data['end']:
            approved = row.get('public_summary')
            if isinstance(approved, str) and approved.strip():
                changes.append(row['at'][:10] + ': ' + approved.strip())
                interventions.append(row)
    if not changes:
        changes = ['No reviewed public intervention summaries are recorded for this week. This does not establish that no changes occurred.']
    changes.append('This article was generated from the disclosure-filtered weekly summary and the existing discovery notebook. No intervention is inferred from traffic changes.')
    report = {
        'title': f"Weekly experiment: {data['start']}",
        'facts': facts,
        'hypotheses': [('Useful AI reuse needs task-level evidence; exact request totals alone cannot establish it.' if exact else
                        'Referring domains may suggest discovery routes, but repeat loads, unknown referrers and fabricated events prevent attribution or causal conclusions.')],
        'changes': changes,
        'next_steps': ['Run the fixed queries in discovery/queries.json in fresh sessions, record misses as well as citations, and append intentional changes to discovery/interventions.jsonl.',
                       'Useful reuse has not been measured by this pipeline. Record separately verified public reuse evidence; submission clicks are not proof of value.'],
        'limitations': ['Without the optional edge route, JavaScript-free HTML/JSON/llms.txt requests are unobserved. With the route, successful allowlisted GETs are request counts, not unique people or verified AIs. Failed/bypassed measurement and default github.io URLs remain unobserved.',
                        'Explicit measurement=test events are excluded. Unmarked operator tests cannot be recognized without identifiers.',
                        'Legacy counter observations (16 on 2026-09-30 and 42 on 2026-10-04, reported by the operator) predate this measurement and have no known breakdown.'],
        'translations': {'ja': make_japanese_report(data, tests, interventions)},
    }
    report['changes'].insert(0, 'Question: what did we change toward articles useful to AI agents, and what evidence did this week actually produce? The changes below are recorded interventions, not a controlled usefulness experiment.')
    report['hypotheses'].insert(0, 'These observations show recorded requests and changes only. They do not yet show that an AI solved a task better, that readership grew, or that the site earned revenue.')
    report['facts'].append(('Revenue is not measured by this access summary; payment tests are separate.' if exact else
                            'Exact historical totals are unavailable from this ten-event-band export. No exact count is inferred. Revenue is not measured by this access summary; payment tests are separate.'))
    ja = report['translations']['ja']
    ja['changes'].insert(0, '問い：AIに役立つ記事を集めるために何を変え、今週はどんな証拠が得られたか。以下は記録された変更であり、有用性を比較する実験ではありません。')
    ja['hypotheses'].insert(0, '分かるのは、記録された取得と変更までです。AIの課題解決の改善、読者の増加、収益はまだ示していません。')
    ja['facts'].append(('このアクセス集計では収益を計測せず、支払いテストは別に扱います。' if exact else
                        'この10件幅の出力から過去の実数は取得できません。実数の推定はしません。このアクセス集計では収益を計測せず、支払いテストは別に扱います。'))
    return apply_editorial_notes(report, data['start'])


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
    headers = {'Accept': 'application/json', 'User-Agent': 'AICQSOHOO-Weekly-Report/1.0'}
    if mode == 'private':
        headers['Authorization'] = 'Bearer ' + os.environ['REPORT_TOKEN']
    request = urllib.request.Request(endpoint + '?start=' + start.isoformat() + '&schema=3', headers=headers)
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
    except Exception as error:
        # HTTP errors can embed request URLs; never print response bodies/secrets.
        status = error.code if isinstance(error, urllib.error.HTTPError) else None
        raise SystemExit(f'Weekly report failed ({type(error).__name__}, HTTP {status}); no new article published. Check endpoint, credentials and summary policy.')
