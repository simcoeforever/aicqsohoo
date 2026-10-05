from pathlib import Path
from html.parser import HTMLParser
import base64
import hashlib
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parent.parent

class Elements(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.buttons = []
    def handle_starttag(self, tag, attrs):
        if tag == 'script': self.scripts.append(dict(attrs))
        if tag == 'button': self.buttons.append(dict(attrs))

class PaymentAssets(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable, str(ROOT/'build.py')], check=True, capture_output=True)

    def test_every_payment_page_pins_actual_bundle_bytes_and_explicit_mode(self):
        source = (ROOT/'static/payment-client.js').read_bytes()
        digest = hashlib.sha256(source).digest()
        expected_url = '/payment-client.' + digest.hex() + '.js'
        for prefix in ['', 'ja/']:
            for suffix, mode in [('contribute/', 'testnet'), ('contribute/self-test/', 'owner-pilot-v5')]:
                parser = Elements()
                text = (ROOT/'site'/prefix/suffix/'index.html').read_text(encoding='utf-8')
                parser.feed(text)
                scripts = [s for s in parser.scripts if 'payment-client' in s.get('src', '')]
                self.assertEqual(len(scripts), 1)
                self.assertEqual(scripts[0]['src'], expected_url)
                self.assertEqual(scripts[0]['integrity'], 'sha256-' + base64.b64encode(digest).decode())
                self.assertEqual(scripts[0]['crossorigin'], 'anonymous')
                self.assertEqual(scripts[0]['data-payment-client'], 'chain-guard-v5')
                self.assertEqual((ROOT/'site'/expected_url.lstrip('/')).read_bytes(), source)
                buttons = [b for b in parser.buttons if b.get('id') == 'test-payment']
                self.assertEqual(len(buttons), 1)
                self.assertEqual(buttons[0]['data-payment-mode'], mode)
                self.assertIn('disabled', buttons[0])
                self.assertNotIn('src="/payment-client.js"', text)

if __name__ == '__main__': unittest.main()
