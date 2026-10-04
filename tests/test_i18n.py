import html
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import build
import weekly_report

ROOT=Path(__file__).resolve().parent.parent

class BilingualTest(unittest.TestCase):
    def test_both_languages_share_counts_sources_uncertainty_and_private_data_filter(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'discovery').mkdir()
            (root/'discovery'/'tests.jsonl').write_text('',encoding='utf-8')
            (root/'discovery'/'interventions.jsonl').write_text('',encoding='utf-8')
            for released in [None,10,120]:
                data=dict(start='2026-09-28',end='2026-10-05',coverage='not_verified',page_views=released,
                          submission_intents=released,resource_gets=released,
                          frequent_referrer_domains=['search.example'] if released else [],
                          frequent_pages=['/about/'] if released else [])
                with patch.object(weekly_report,'ROOT',root): report=weekly_report.make_report(data)
                ja=report['translations']['ja']
                self.assertEqual(len(report['facts']),len(ja['facts']))
                self.assertIn('not_verified',' '.join(ja['facts']))
                if released:
                    for n in (released,released+9):
                        self.assertIn(str(n),' '.join(report['facts']))
                        self.assertIn(str(n),' '.join(ja['facts']))
                    self.assertIn('search.example',' '.join(ja['facts']))
                    self.assertIn('/about/',' '.join(ja['facts']))
                else:
                    self.assertIn('not evidence of no visitors',' '.join(report['facts']))
                    self.assertIn('訪問者がいないという証拠ではありません',' '.join(ja['facts']))
                self.assertIn('cannot be inferred',' '.join(report['facts']))
                self.assertIn('推測できません',' '.join(ja['facts']))

    def test_unknown_intervention_translation_is_labelled_instead_of_invented(self):
        from weekly_i18n import make_japanese_report
        data=dict(start='2026-09-28',end='2026-10-05',coverage='partial',page_views=None,
                  submission_intents=None,resource_gets=None,frequent_referrer_domains=[],frequent_pages=[])
        ja=make_japanese_report(data,[],[{'at':'2026-09-30','public_summary':'Reviewed English change.'}])
        self.assertIn('原文英語・日本語訳未確認：Reviewed English change.', ' '.join(ja['changes']))

    def test_switches_canonical_language_sitemap_and_shared_measurement_paths(self):
        subprocess.run([sys.executable,str(ROOT/'build.py')],env={**os.environ,'BASE_URL':'https://aicqsohoo.com','METRICS_ENABLED':'true'},check=True,capture_output=True)
        paths=['/about/','/experiment/']+[f'/experiment/{p.stem}/' for p in (ROOT/'data'/'reports').glob('*.json')]
        for path in paths:
            en=(ROOT/'site'/path.strip('/')/'index.html').read_text(encoding='utf-8')
            ja=(ROOT/'site'/'ja'/path.strip('/')/'index.html').read_text(encoding='utf-8')
            self.assertIn('<html lang="en">',en);self.assertIn('<html lang="ja">',ja)
            self.assertIn(f'href="/ja{path}"',en);self.assertIn(f'href="{path}"',ja)
            self.assertIn(f'rel="canonical" href="https://aicqsohoo.com/ja{path}"',ja)
            self.assertIn('hreflang="ja"',en);self.assertIn('hreflang="en"',ja)
            metric='/experiment/' if path.startswith('/experiment/') else path
            self.assertIn(f'data-page="{metric}"',ja)
        # Existing machine interfaces retain their fields and English canonical URLs.
        generated=json.loads((ROOT/'site'/'experiences.json').read_text(encoding='utf-8'))
        for row in generated:
            original=json.loads((ROOT/'data'/'experiences'/(row['id']+'.json')).read_text(encoding='utf-8'))
            for key in build.EXPERIENCE_FIELDS:
                if key!='canonical_url': self.assertEqual(row[key],original[key])
            self.assertIn('/experiences/',row['canonical_url']);self.assertNotIn('/ja/',row['canonical_url'])

    def test_missing_reviewed_translation_fails_build(self):
        with tempfile.TemporaryDirectory() as folder:
            data=Path(folder);(data/'reports').mkdir()
            report=dict(title='test',**{k:['test'] for k in ('facts','hypotheses','changes','next_steps','limitations')})
            (data/'reports'/'new.json').write_text(json.dumps(report),encoding='utf-8')
            with patch.object(build,'DATA',data), self.assertRaises(ValueError): build.render_reports()
