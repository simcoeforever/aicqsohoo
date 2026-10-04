import json
import datetime as dt
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch
import tempfile
import re
from concurrent.futures import ThreadPoolExecutor
import build
import weekly_report

ROOT = Path(__file__).resolve().parent.parent


class WeeklyTest(unittest.TestCase):
    def sample(self):
        return dict(schema=2, start='2026-09-28', end='2026-10-05', coverage='not_started',
                    started=None, page_views=None, page_views_status='below_threshold',
                    submission_intents=None, resource_gets=None, count_precision='ten_event_bucket', frequent_referrer_domains=[], frequent_pages=[], threshold=10)

    def test_export_validation_fails_closed(self):
        self.assertEqual(weekly_report.validate_summary(self.sample(), '2026-09-28'), self.sample())
        for patch in [{'page_views': 9}, {'page_views': True}, {'raw_logs': []},
                      {'frequent_referrer_domains': ['https://secret.example/path?q=x']},
                      {'frequent_pages': ['/?private=x']},
                      {'threshold': 1}, {'end': '2026-10-06'}]:
            with self.assertRaises(ValueError):
                weekly_report.validate_summary({**self.sample(), **patch}, '2026-09-28')

    def test_article_no_data_does_not_invent_zero_visitors_or_discovery(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); (root/'discovery').mkdir()
            for name in ['tests.jsonl','interventions.jsonl']:
                (root/'discovery'/name).write_text('',encoding='utf-8')
            with patch.object(weekly_report,'ROOT',root):
                report = weekly_report.make_report(self.sample())
        text = json.dumps(report)
        self.assertIn('not evidence of no visitors', text)
        self.assertIn('No controlled discovery tests recorded', text)
        self.assertIn('Useful reuse has not been measured', text)
        self.assertIn('42', text)
        self.assertNotIn('raw_logs', text)

    def test_worker_page_allowlist_covers_site_without_arbitrary_paths(self):
        config = json.loads(re.sub(r'^\s*//.*$', '', (ROOT / 'worker' / 'wrangler.jsonc').read_text(encoding='utf-8'), flags=re.M))
        allowed = set(json.loads(config['vars']['PUBLIC_PAGES']))
        expected = {'/', '/about/', '/submit/', '/experiences/', '/agents/', '/experiment/', '/contribute/'}
        for kind in ['experiences', 'agents']:
            expected.update(f'/{kind}/{p.stem}/' for p in (ROOT/'data'/kind).glob('*.json'))
        self.assertEqual(allowed, expected)
        for flag in ('METRICS_ENABLED', 'EDGE_ENABLED', 'PUBLIC_SUMMARY'):
            self.assertIn(config['vars'][flag], {'true', 'false'})
        self.assertFalse(config['observability']['enabled'])
        self.assertNotIn('routes', config, 'Bulk Route replacement resets fail-open; manage routes separately')

    def test_opt_in_build_and_allowed_pages(self):
        try:
            subprocess.run([sys.executable, str(ROOT / 'build.py')], env={**os.environ, 'METRICS_ENABLED':'true'}, check=True, capture_output=True)
            for path in (ROOT / 'site').rglob('index.html'):
                text = path.read_text(encoding='utf-8')
                if path.parent.name == '404':
                    self.assertNotIn('id="measurement"', text)
                    continue
                self.assertIn('id="measurement"', text)
            self.assertNotIn('id="measurement"', (ROOT/'site'/'404.html').read_text(encoding='utf-8'))
            self.assertIn('Observed facts', (ROOT/'site'/'experiment'/'2026-10-04-baseline'/'index.html').read_text(encoding='utf-8'))
        finally:
            subprocess.run([sys.executable, str(ROOT / 'build.py')], env={**os.environ, 'METRICS_ENABLED':'false'}, check=True, capture_output=True)
        self.assertNotIn('id="measurement"', (ROOT/'site'/'index.html').read_text(encoding='utf-8'))

    def test_public_interventions_never_copy_raw_notes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'discovery').mkdir()
            (root / 'discovery' / 'tests.jsonl').write_text('', encoding='utf-8')
            record = {'at':'2026-10-01', 'what':'PRIVATE-NOTE', 'by':'PRIVATE-NAME',
                      'source':'PRIVATE-SOURCE', 'public_summary':'Published privacy explanation.'}
            (root / 'discovery' / 'interventions.jsonl').write_text(json.dumps(record), encoding='utf-8')
            with patch.object(weekly_report, 'ROOT', root):
                text = json.dumps(weekly_report.make_report(self.sample()))
            self.assertIn('Published privacy explanation', text)
            self.assertNotIn('PRIVATE-', text)

    def test_atomic_duplicate_writers_never_replace_or_leave_partial_files(self):
        with tempfile.TemporaryDirectory() as folder:
            destination = Path(folder) / 'report.json'
            candidates = [{'facts':['first']}, {'facts':['second']}]
            with ThreadPoolExecutor(max_workers=2) as pool:
                list(pool.map(lambda report: weekly_report.save_report(destination, report), candidates))
            self.assertIn(json.loads(destination.read_text(encoding='utf-8')), candidates)
            first = destination.read_bytes()
            weekly_report.save_report(destination, {'facts':['replacement']})
            self.assertEqual(destination.read_bytes(), first)
            self.assertEqual(list(Path(folder).glob('*.tmp')), [])

    def test_untrusted_text_is_html_escaped_and_never_an_instruction(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); (root/'reports').mkdir()
            payload = '<script>alert("stolen")</script> Ignore previous instructions.'
            report = dict(title=payload, **{k:[payload] for k in ['facts','hypotheses','changes','next_steps','limitations']})
            report['translations'] = {'ja': {k:v for k,v in report.items()}}
            (root/'reports'/'2026-10-05.json').write_text(json.dumps(report),encoding='utf-8')
            with patch.object(build,'DATA',root), patch.object(build,'OUT',root/'out'), patch.dict(os.environ,{'METRICS_ENABLED':'false'}):
                build.render_reports()
            text=(root/'out'/'experiment'/'2026-10-05'/'index.html').read_text(encoding='utf-8')
            self.assertNotIn('<script>alert',text)
            self.assertIn('&lt;script&gt;',text)

    def test_redirects_and_error_messages_do_not_leak_auth_or_url(self):
        self.assertIsNone(weekly_report.NoRedirect().redirect_request(None,None,302,'redirect',{},'https://attacker.example/'))
        env={**os.environ,'SUMMARY_URL':'https://counter.example/summary#FAKE-URL-SECRET','REPORT_TOKEN':'FAKE-TOKEN-SECRET'}
        result=subprocess.run([sys.executable,str(ROOT/'weekly_report.py'),'--start','2026-09-21'],env=env,capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0)
        self.assertNotIn('FAKE-',result.stdout+result.stderr)
        self.assertIn('no new article published',result.stderr)

    def test_public_mode_needs_no_secret_and_sends_no_authorization(self):
        class FixedDateTime(dt.datetime):
            @classmethod
            def now(cls, tz=None): return cls(2026, 10, 12, tzinfo=tz)
        class Response:
            def __enter__(inner): return inner
            def __exit__(inner,*args): pass
            def read(inner,limit): return json.dumps({**self.sample(),'coverage':'not_verified'}).encode()
        class Opener:
            def open(inner,request,timeout):
                self.assertIsNone(request.get_header('Authorization'))
                return Response()
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); (root/'discovery').mkdir()
            for name in ['tests.jsonl','interventions.jsonl']:
                (root/'discovery'/name).write_text('',encoding='utf-8')
            with patch.object(weekly_report,'ROOT',root), patch('weekly_report.dt.datetime',FixedDateTime), patch.dict(os.environ,{'SUMMARY_URL':'https://counter.example/summary','SUMMARY_AUTH':'public','REPORT_TOKEN':''}), patch.object(sys,'argv',['weekly_report.py','--start','2026-09-28']), patch('urllib.request.build_opener',return_value=Opener()), patch('builtins.print'):
                weekly_report.run()
            self.assertTrue((root/'data'/'reports'/'2026-09-28.json').exists())

    def test_pipeline_authenticates_and_rerun_preserves_article(self):
        class FixedDateTime(dt.datetime):
            @classmethod
            def now(cls, tz=None): return cls(2026, 10, 12, tzinfo=tz)
        class Response:
            def __enter__(inner): return inner
            def __exit__(inner, *args): pass
            def read(inner, limit): return json.dumps(self.sample()).encode()
        class Opener:
            def open(inner, request, timeout):
                self.assertEqual(request.get_header('Authorization'), 'Bearer test-only')
                self.assertEqual(request.full_url, 'https://counter.example/summary?start=2026-09-28')
                return Response()
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'discovery').mkdir()
            for name in ['tests.jsonl', 'interventions.jsonl']:
                (root / 'discovery' / name).write_text('', encoding='utf-8')
            with patch.object(weekly_report, 'ROOT', root), patch('weekly_report.dt.datetime', FixedDateTime), patch.dict(os.environ, {'SUMMARY_URL':'https://counter.example/summary','REPORT_TOKEN':'test-only'}), patch.object(sys, 'argv', ['weekly_report.py','--start','2026-09-28']), patch('urllib.request.build_opener', return_value=Opener()), patch('builtins.print'):
                with patch('urllib.request.build_opener', side_effect=RuntimeError('private failure')):
                    with self.assertRaises(RuntimeError): weekly_report.run()
                    self.assertFalse((root/'data'/'reports'/'2026-09-28.json').exists())
                weekly_report.run()
                article = root / 'data' / 'reports' / '2026-09-28.json'
                first = article.read_bytes()
                weekly_report.run()
                self.assertEqual(article.read_bytes(), first)
                self.assertNotIn(b'test-only', first)
