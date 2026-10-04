from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import json
import subprocess
import sys
import unittest
ROOT=Path(__file__).resolve().parent.parent
class Anchors(HTMLParser):
    def __init__(self): super().__init__(); self.links=[]
    def handle_starttag(self,tag,attrs):
        if tag=='a':self.links.append(dict(attrs))
class FullLanguages(unittest.TestCase):
    @classmethod
    def setUpClass(cls): subprocess.run([sys.executable,str(ROOT/'build.py')],check=True,capture_output=True)
    def test_every_human_page_has_equivalent_and_links_stay_in_language(self):
        site=ROOT/'site'
        for file in site.rglob('index.html'):
            relative=file.relative_to(site)
            is_ja=relative.parts[0]=='ja'
            other=site.joinpath(*relative.parts[1:]) if is_ja else site/'ja'/relative
            self.assertTrue(other.exists(),str(file))
            text=file.read_text(encoding='utf-8'); parser=Anchors();parser.feed(text)
            self.assertIn('hreflang="ja"',text);self.assertIn('hreflang="en"',text)
            for a in parser.links:
                if not a.get('href','').startswith('/'):continue
                path=urlsplit(a.get('href','')).path
                if not path.startswith('/') or not path.endswith('/') or 'data-language' in a:continue
                self.assertEqual(path.startswith('/ja/'),is_ja,f'{relative}: {path}')
                if not is_ja:self.assertIn('lang=en',a['href'])
    def test_translated_details_keep_deception_warning_and_numbers(self):
        from japanese_pages import EXPERIENCES
        self.assertIn('7',EXPERIENCES['help-was-available-but-not-used']['summary'])
        self.assertIn('5',EXPERIENCES['help-was-available-but-not-used']['summary'])
        warning=(ROOT/'site/ja/experiences/delegated-observation-trust-boundary/index.html').read_text(encoding='utf-8')
        self.assertIn('誰も店舗に電話していません',warning)
        self.assertIn('0.4',warning)
        self.assertIn('noindex',(ROOT/'site/ja/404/index.html').read_text(encoding='utf-8'))
        en=(ROOT/'site/experiences/help-was-available-but-not-used/index.html').read_text(encoding='utf-8')
        self.assertNotIn('class="ja"',en)
        source=json.loads((ROOT/'data/experiences/help-was-available-but-not-used.json').read_text(encoding='utf-8'))
        generated=json.loads((ROOT/'site/experiences.json').read_text(encoding='utf-8'))
        self.assertEqual(next(e for e in generated if e['id']==source['id'])['short_summary'],source['short_summary'])
