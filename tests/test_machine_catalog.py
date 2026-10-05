import hashlib
import json
from pathlib import Path
import subprocess
import sys
import unittest
from urllib.parse import urlsplit
from html import unescape

ROOT = Path(__file__).resolve().parent.parent


class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable, str(ROOT/'build.py')], check=True, capture_output=True)
        cls.site = ROOT/'site'
        cls.index = json.loads((cls.site/'index.json').read_text(encoding='utf-8'))

    def test_schema_links_languages_dates_and_content_hash(self):
        schema = json.loads((self.site/'machine-schema.json').read_text(encoding='utf-8'))
        self.assertEqual(self.index['schema_version'], 1)
        self.assertTrue(self.index['read_only'])
        self.assertEqual(schema['$defs']['record']['properties']['language']['enum'], ['en', 'ja'])
        keys = set()
        for entry in self.index['records']:
            key = (entry['kind'], entry['id'], entry['language'])
            self.assertNotIn(key, keys)
            keys.add(key)
            record = json.loads((self.site/urlsplit(entry['json_url']).path.lstrip('/')).read_text(encoding='utf-8'))
            self.assertEqual(set(record), set(schema['$defs']['record']['required']))
            self.assertEqual({k: v for k, v in record.items() if k != 'content'}, entry)
            self.assertEqual(set(record['dates']), {'observed_at', 'published_at', 'modified_at'})
            self.assertEqual(record['content_sha256'], hashlib.sha256(json.dumps(record['content'], ensure_ascii=False, sort_keys=True).encode()).hexdigest())
            self.assertTrue(record['sources'])
            self.assertIn('verification_status', record['evidence'])
            self.assertTrue(all(urlsplit(x).scheme in ['http', 'https'] for x in record['sources']))
            html_path = self.site/urlsplit(record['canonical_url']).path.lstrip('/')/'index.html'
            text = unescape(html_path.read_text(encoding='utf-8'))
            self.assertIn(record['title'], text)
            self.assertIn('rel="alternate" type="application/json"', text)
            self.assertIn(urlsplit(entry['json_url']).path, text)
        for kind, stable_id, lang in keys:
            self.assertIn((kind, stable_id, 'ja' if lang == 'en' else 'en'), keys)
        self.assertEqual({k[0] for k in keys}, {'experience', 'agent', 'weekly_report', 'experiment_article', 'payment_policy'})

    def test_reports_use_identical_reviewed_fields_in_html_and_json(self):
        from machine_catalog import reviewed_report
        for source in (ROOT/'data/reports').glob('*.json'):
            views = reviewed_report(ROOT/'data', source)
            for lang, content in views.items():
                entry = next(r for r in self.index['records'] if r['id'] == source.stem and r['language'] == lang)
                record = json.loads((self.site/urlsplit(entry['json_url']).path.lstrip('/')).read_text(encoding='utf-8'))
                self.assertEqual(record['content'], content)
                text = unescape((self.site/urlsplit(entry['canonical_url']).path.lstrip('/')/'index.html').read_text(encoding='utf-8'))
                for section in ['facts', 'hypotheses', 'changes', 'next_steps', 'limitations']:
                    for sentence in content[section]:
                        self.assertIn(sentence, text)
        weekly = next(r for r in self.index['records'] if r['id'] == '2026-09-28' and r['language'] == 'en')
        record = json.loads((self.site/urlsplit(weekly['json_url']).path.lstrip('/')).read_text(encoding='utf-8'))
        self.assertTrue(any('42' in x and '16' in x for x in record['content']['limitations']))
        self.assertTrue(any('30\u201339' in x for x in record['content']['facts']))
        self.assertTrue(any('not_verified' in x for x in record['content']['facts']))

    def test_experience_content_matches_existing_public_sources(self):
        from japanese_pages import EXPERIENCES
        old = json.loads((self.site/'experiences.json').read_text(encoding='utf-8'))
        for e in old:
            en = json.loads((self.site/f'records/experience/{e["id"]}.en.json').read_text(encoding='utf-8'))
            ja = json.loads((self.site/f'records/experience/{e["id"]}.ja.json').read_text(encoding='utf-8'))
            self.assertEqual(en['content'], e)
            self.assertEqual(ja['content']['short_summary'], EXPERIENCES[e['id']]['summary'])
            self.assertEqual(ja['content']['reusable_lessons'], EXPERIENCES[e['id']]['lessons'])
            self.assertEqual(en['evidence']['kind'], e['evidence_kind'])
            self.assertEqual(en['evidence']['confidence'], e['confidence'])

    def test_machine_home_compatibility_and_closed_payment_snapshot(self):
        for lang in ['en', 'ja']:
            home = (self.site/('ja' if lang == 'ja' else '')/'index.html').read_text(encoding='utf-8')
            self.assertIn('/index.json', home)
            self.assertNotIn('1998', home)
            self.assertNotIn('<picture>', home)
            self.assertIn('unknown', self.index['date_policy'])
            payment = json.loads((self.site/f'records/payment_policy/payment-policy.{lang}.json').read_text(encoding='utf-8'))
            self.assertEqual(payment['content']['snapshot_state'], 'settled_and_closed')
            self.assertFalse(payment['content']['snapshot_general_contributions_enabled'])
            self.assertEqual(payment['content']['amount_atomic'], '10000')
            self.assertEqual(payment['content']['payer'], '0x15835b36659fA5c252A8Bd575527d6B20BC6575B')
            self.assertIn('/contribution/mainnet/info', payment['evidence']['runtime_status_url'])
        llms = (self.site/'llms.txt').read_text(encoding='utf-8')
        self.assertIn('/index.json', llms)
        self.assertIn('/machine-schema.json', llms)
        self.assertIn('does not guarantee', llms)
        self.assertNotIn('signature', json.dumps(self.index))

    def test_measurement_manifest_is_derived_from_catalog_without_visitor_fields(self):
        manifest = json.loads((self.site/'measurement-manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(set(manifest), {'schema_version', 'resources'})
        entries = {r['path']: r['group'] for r in manifest['resources']}
        self.assertEqual(len(entries), len(self.index['records'])+4)
        for record in self.index['records']:
            self.assertEqual(entries[urlsplit(record['json_url']).path], '/records/'+record['kind']+'/')
        self.assertEqual(entries['/ja/payment-policy/'], '/payment-policy/')
        self.assertEqual(entries['/payment-policy/'], '/payment-policy/')
        self.assertNotIn('id', {k for r in manifest['resources'] for k in r})
        # Policy HTML GET is counted at the edge; no unsupported browser event.
        for lang in ['', 'ja/']:
            self.assertNotIn('id="measurement"', (self.site/(lang+'payment-policy/index.html')).read_text(encoding='utf-8'))
