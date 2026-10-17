import importlib.util,pathlib,unittest,datetime,zipfile
p=pathlib.Path(__file__).with_name('shared-asset-storage-reuse.py');s=importlib.util.spec_from_file_location('reuse',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class RefusalTests(unittest.TestCase):
 def test_provenance_success_and_freshness(self):
  r={'id':m.RUN,'event':'pull_request','path':'.github/workflows/ci.yml','pull_requests':[{'number':308}]};a={'workflow_run':{'id':m.RUN},'expired':False,'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'name':'shared-asset-storage-a'};j=[{'name':'shared-asset-storage / candidate','conclusion':'success'}]
  self.assertTrue(m.eligible(r,a,j,308))
  for change in [{'expired':True},{'created_at':'2020-01-01T00:00:00Z'},{'name':'other'},{'workflow_run':{'id':0}}]:self.assertFalse(m.eligible(r,{**a,**change},j,308))
  self.assertFalse(m.eligible(r,a,j,309));self.assertFalse(m.eligible(r,a,[{**j[0],'conclusion':'failure'}],308));self.assertFalse(m.eligible({**r,'event':'push'},a,j,308))
 def test_changed_inputs_refuse(self):
  p={'schema':1,'route':'shared-asset-storage','base':'a','components':{'backend':'b'},'tests':['permission'],'focusedTests':[],'changed':['backend'],'required':['new-schema-restore']}
  self.assertTrue(m.plans_match(p,{**p,'head':'new'}))
  for k,v in [('components',{'backend':'changed'}),('tests',['other']),('required',[])]:self.assertFalse(m.plans_match(p,{**p,k:v}))
 def test_unsafe_zip_paths_refuse(self):
  self.assertTrue(m.safe_entries([zipfile.ZipInfo('shared-asset-storage-evidence/checks.json')]))
  for f in ['/tmp/x','../x','shared-asset-storage-evidence/../../x','unexpected/key']:self.assertFalse(m.safe_entries([zipfile.ZipInfo(f)]))
  i=zipfile.ZipInfo('shared-asset-storage-evidence/link');i.external_attr=0o120777<<16;self.assertFalse(m.safe_entries([i]))
if __name__=='__main__':unittest.main()
