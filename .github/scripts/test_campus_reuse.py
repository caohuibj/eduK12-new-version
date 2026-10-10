import copy,importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('campus_reuse',Path(__file__).with_name('campus-reuse.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class CampusReuseTests(unittest.TestCase):
 def fixture(self):
  p={'schema':1,'route':'campus','base':'base','head':'head','changed':['frontend'],'components':{'frontend':'tree'}}
  receipt={'head':'head','components':p['components'],'phases':[{'name':name,'status':'success'} for name in ['frontend-compile','frontend-runtime','frontend-contracts']],'images':{'frontend':'image'},'bases':{'node':'node@sha256:abc'}}
  reports={'frontend':{'success':True,'numFailedTests':0,'numPendingTests':0,'numPassedTests':1,'numTotalTests':1,'testResults':[{'assertionResults':[{'status':'passed'}]}]}}
  scans={'frontend':{'Trivy':{'Version':'0.70.0'},'Metadata':{'ImageID':'image'},'Results':[]}}
  return p,copy.deepcopy(p),receipt,reports,scans
 def test_accepts_only_same_input_complete_phases(self):module.verify_receipt(*self.fixture())
 def test_rejects_changed_tree_failed_or_skipped_phase_and_test(self):
  for field in ['tree','phase','test','count']:
   args=self.fixture()
   if field=='tree':args[1]['components']['frontend']='other'
   if field=='phase':args[2]['phases'][0]['status']='failure'
   if field=='test':args[3]['frontend']['testResults'][0]['assertionResults'][0]['status']='skipped'
   if field=='count':args[3]['frontend']['numTotalTests']=2
   with self.assertRaises(AssertionError):module.verify_receipt(*args)
 def test_rejects_different_image_or_high_fixed_vulnerability(self):
  for field in ['image','vulnerability']:
   args=self.fixture()
   if field=='image':args[4]['frontend']['Metadata']['ImageID']='other'
   else:args[4]['frontend']['Results']=[{'Vulnerabilities':[{'Severity':'HIGH','FixedVersion':'1'}]}]
   with self.assertRaises(AssertionError):module.verify_receipt(*args)
