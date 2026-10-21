"""Small control-only evidence rejection contracts; no application execution."""
import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('r',Path(__file__).with_name('survey-wave-selection-reuse.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class Contracts(unittest.TestCase):
 def test_audit_and_unit_log_boundaries(self):
  r.log_contract('backend','npm audit --audit-level=high\nfound 0 vulnerabilities')
  text='npm audit --audit-level=high\n3 vulnerabilities (1 low, 2 moderate)\nSurveyWaveContentSelection.test.tsx (7 tests)\nTest Files 6 passed (6)\nTests 32 passed (32)'
  r.log_contract('frontend',text)
  for altered in [text.replace('7 tests','6 tests'),text.replace('32 passed','31 passed'),text.replace('1 low, 2 moderate','1 high, 2 moderate')]:
   with self.assertRaises(AssertionError):r.log_contract('frontend',altered)
 def test_official_identity_and_completion(self):
  def api(path):
   if path.startswith('runs/'):return {'id':r.RUN,'head_sha':r.SOURCE,'run_attempt':1,'conclusion':'success'}
   return {'run_id':r.RUN,'head_sha':r.SOURCE,'conclusion':'success','steps':[{'name':'bounded Survey Wave options and authoritative freeze contracts','conclusion':'success'}]}
  r.official('backend',api)
  for key,value in [('head_sha','0'*40),('conclusion','skipped'),('run_attempt',2)]:
   with self.assertRaises(AssertionError):r.official('backend',lambda p:{**api(p),key:value} if p.startswith('runs/') else api(p))
if __name__=='__main__':unittest.main()
