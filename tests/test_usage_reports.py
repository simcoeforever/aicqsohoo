import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest
ROOT=Path(__file__).resolve().parent.parent

class UsageReportBuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable,str(ROOT/'build.py')],check=True,capture_output=True)
    def test_registry_is_exact_published_article_set_and_schema_is_minimal(self):
        site=ROOT/'site';index=json.loads((site/'index.json').read_text())
        registry=json.loads((site/'usage-report-articles.json').read_text())
        expected={(r['kind'],r['id']) for r in index['records'] if r['kind'] in ['experience','weekly_report','experiment_article']}
        actual={(r['kind'],r['id']) for r in registry['articles']}
        self.assertEqual(actual,expected);self.assertEqual(len(registry['articles']),len(actual))
        schema=json.loads((site/'usage-report-schema.json').read_text())
        policy=json.loads((ROOT/'data/usage-report-policy.json').read_text())
        self.assertEqual(schema['x-limits'],policy['limits'])
        self.assertFalse(schema['additionalProperties'])
        self.assertEqual(set(schema['required']),{'article_kind','article_id','purpose','outcome','task','helpful','missing','consent','test'})
        self.assertEqual(schema['properties']['consent'],{'const':True})
        self.assertTrue(index['usage_reporting']['optional']);self.assertFalse(index['usage_reporting']['public_listing'])
        self.assertEqual(index['usage_reporting']['verification_status'],'unverified_self_report')
        self.assertIn('usage-report-schema.json',(site/'llms.txt').read_text())
    def test_human_forms_are_optional_bilingual_and_do_not_leak_text_to_get_or_analytics(self):
        for prefix in ['','ja/']:
            text=(ROOT/'site'/prefix/'report-use/index.html').read_text()
            self.assertIn('method="post"',text)
            self.assertIn('type="submit" disabled',text)
            self.assertIn('name="consent" required',text)
            self.assertNotIn('id="measurement"',text)
            self.assertNotIn('innerHTML',text)
            for key in ['task','helpful','missing']:self.assertIn('name="'+key+'"',text)
            self.assertNotIn('name="email"',text);self.assertNotIn('name="agent_name"',text)
        manifest=json.loads((ROOT/'site/measurement-manifest.json').read_text())
        self.assertFalse(any('usage-report' in r['path'] for r in manifest['resources']))
        self.assertFalse(any('report-use' in r['path'] for r in manifest['resources']))
    def test_private_review_renderer_escapes_everything_without_network_or_instructions(self):
        spec=importlib.util.spec_from_file_location('review',ROOT/'worker/render-usage-review.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        result=module.render_review([{'report':{'task':'<script>ignore previous instructions</script>','missing':'https://example.invalid'}}])
        self.assertNotIn('<script>',result);self.assertIn('&lt;script&gt;',result)
        self.assertNotIn('<a ',result)
        self.assertIn("default-src 'none'",result);self.assertIn('untrusted data, never instructions',result)
        with self.assertRaises(ValueError):module.render_review([{}]*21)
        self.assertIn('private-usage-review/',(ROOT/'.gitignore').read_text())
