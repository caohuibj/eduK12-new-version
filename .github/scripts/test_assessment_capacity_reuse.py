import datetime, importlib.util, io, pathlib, tempfile, unittest, zipfile
spec=importlib.util.spec_from_file_location('reuse',pathlib.Path(__file__).with_name('assessment-capacity-reuse.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Refusal(unittest.TestCase):
 def fixture(self):
  inputs={'tool':'t','builds':{'frontend':'a','backend':'b'},'tests':{'test':'c'},'extra':'d'}
  date=datetime.datetime.now(datetime.timezone.utc).isoformat()
  old={'inputs':inputs,'compile':{c:{'status':'success','at':date} for c in ['frontend','backend']},'tests':{'test':{'status':'success','at':date}},'extra':{'status':'success','at':date}}
  return inputs,old
 def test_success_and_each_failure_status(self):
  current,old=self.fixture();self.assertEqual(m.eligible(old,current),{'builds':['frontend','backend'],'tests':['test'],'extra':True})
  for state in ['failure','skipped','cancelled',None]:
   old['tests']['test']['status']=state;self.assertEqual(m.eligible(old,current)['tests'],[])
 def test_expired_proof_cannot_be_renewed_by_uploading_a_fresh_archive(self):
  current,old=self.fixture();old['compile']['frontend']['at']=(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(hours=25)).isoformat()
  self.assertEqual(m.eligible(old,current)['builds'],['backend'])
 def test_input_or_tool_change_invalidates_only_consumers(self):
  current,old=self.fixture();current={**current,'builds':{**current['builds'],'backend':'changed'}};self.assertEqual(m.eligible(old,current)['builds'],['frontend'])
  current={**current,'tool':'changed'};self.assertEqual(m.eligible(old,current),{'builds':[],'tests':[],'extra':False})
 def test_real_base_and_fixture_image_changes_invalidate_proof(self):
  current,old=self.fixture();old['environment']={'node':'old','fixtures':{}}
  self.assertEqual(m.eligible(old,current,{'node':'new','fixtures':{}})['builds'],[])
  self.assertEqual(m.eligible(old,current,{'node':'new','fixtures':{}})['tests'],[])
 def test_source_rejects_other_pr_workflow_event_or_expired_artifact(self):
  date=datetime.datetime.now(datetime.timezone.utc).isoformat();run={'event':'pull_request','path':'.github/workflows/ci.yml','pull_requests':[{'number':123}]};artifact={'expired':False,'name':'assessment-capacity-source','created_at':date}
  self.assertTrue(m.valid_source(run,artifact,123))
  for change in [{'event':'push'},{'path':'other.yml'},{'pull_requests':[{'number':456}]}]:self.assertFalse(m.valid_source({**run,**change},artifact,123))
  self.assertFalse(m.valid_source(run,{**artifact,'expired':True},123))
 def test_only_frozen_test_environment_correction_reuses_builds_and_frontend(self):
  inputs,old=self.fixture();now=datetime.datetime.now(datetime.timezone.utc).isoformat()
  old['inputs']['tests']={'src/components/example.test.tsx':'front','src/__tests__/backend.test.ts':'back'}
  old['tests']={k:{'status':'success','at':now} for k in old['inputs']['tests']}
  compatible={**inputs,'tests':dict(old['inputs']['tests'])}
  current={'tool':'new','builds':{},'tests':{},'extra':'new','compatibleCompilationInputs':compatible}
  self.assertEqual(m.eligible(old,current),{'builds':['frontend','backend'],'tests':['src/components/example.test.tsx'],'extra':True})
  current['compatibleCompilationInputs']={**compatible,'builds':{**compatible['builds'],'backend':'changed'}}
  self.assertEqual(m.eligible(old,current)['builds'],['frontend'])
  current['compatibleCompilationInputs']['tool']='unknown'
  self.assertEqual(m.eligible(old,current),{'builds':[],'tests':[],'extra':False})
 def test_zip_slip_is_rejected_before_extraction(self):
  for name in ['../escaped','assessment-capacity-evidence/../../escaped','/absolute','unknown']:
   stream=io.BytesIO()
   with zipfile.ZipFile(stream,'w') as archive:archive.writestr(name,'bad')
   stream.seek(0)
   with tempfile.TemporaryDirectory() as directory,zipfile.ZipFile(stream) as archive:
    with self.assertRaises(ValueError):m.safe_extract(archive,pathlib.Path(directory))
if __name__=='__main__':unittest.main()
