import json,unittest,zipfile,hashlib
from pathlib import Path
class ProductDraftTests(unittest.TestCase):
 def test_public_draft_has_no_checkout_and_sample_commands_exist(self):
  root=Path(__file__).resolve().parent.parent
  product=json.loads((root/'data/products.json').read_text(encoding='utf-8'))['products'][0]
  self.assertFalse(product['sales_enabled']);self.assertIsNone(product['price']);self.assertIsNone(product['checkout_url']);self.assertIsNone(product['license'])
  sample=json.loads((root/'data/verification-kit-sample.json').read_text(encoding='utf-8'))
  self.assertTrue(sample['sample']);self.assertFalse(sample['sales_enabled'])
  for row in sample['checks']:
   for name in row['test'].split()[2:]: self.assertTrue((root/name).is_file())
  self.assertNotIn('signature',json.dumps(sample).lower().replace('signature/domain','domain'))
