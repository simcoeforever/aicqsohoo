import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import weekly_report

ROOT=Path(__file__).resolve().parent.parent

class DiscoveryIterationTest(unittest.TestCase):
    def test_known_target_checks_are_excluded_and_internal_searches_are_one_trial(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'discovery').mkdir()
            rows=[{'tested_at':'2026-10-04','query_id':'purchase-task','discovered':False,'searches':10,'observer_knows_target':False},
                  {'tested_at':'2026-10-04','query_id':'informed-check','discovered':True,'observer_knows_target':True},
                  {'tested_at':'2026-10-04','query_id':'not-blind','discovered':True,'blind_test':False},
                  {'tested_at':'2026-10-04','query_id':'site-check','discovered':True}]
            (root/'discovery'/'tests.jsonl').write_text('\n'.join(json.dumps(x) for x in rows),encoding='utf-8')
            (root/'discovery'/'interventions.jsonl').write_text('',encoding='utf-8')
            data=dict(start='2026-09-28',end='2026-10-05',coverage='not_verified',page_views=None,submission_intents=None,resource_gets=None,frequent_referrer_domains=[],frequent_pages=[])
            with patch.object(weekly_report,'ROOT',root):report=weekly_report.make_report(data)
            self.assertIn('Controlled discovery tests recorded: 1; tests with a site citation/link: 0.',report['facts'])
            self.assertIn('条件を決めた発見テストの記録：1件、サイトへの引用・リンクを含むテスト：0件。',report['translations']['ja']['facts'])

    def test_clarified_case_keeps_original_evidence_and_disclaims_purchases(self):
        data=json.loads((ROOT/'data'/'experiences'/'help-was-available-but-not-used.json').read_text(encoding='utf-8'))
        self.assertEqual(data['id'],'help-was-available-but-not-used')
        self.assertIn('$10 virtual',data['title'])
        self.assertIn('no real money was spent',data['short_summary'].lower())
        self.assertIn('not verified purchases',data['outcome'])
        self.assertEqual(data['confidence']['level'],'low')
        self.assertEqual(data['sample_size'],'7 runs, 10 cases, 1 reviewer model')
        self.assertEqual(data['observed_at'],'2026-09-26')
        self.assertEqual(data['updated_at'],'2026-10-04')
