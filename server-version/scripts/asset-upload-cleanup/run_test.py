import importlib.util, json, pathlib, subprocess, unittest
from unittest.mock import Mock
spec=importlib.util.spec_from_file_location('pending_cleanup',pathlib.Path(__file__).with_name('run.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
def backend():
 return {'Name':'/eduk12-prod-backend','Image':'sha256:'+'a'*64,'State':{'Running':True},'Config':{'Env':['COS_SECRET_KEY=synthetic-not-production']},'NetworkSettings':{'Networks':{'eduk12-prod_default':{}}}}
class CleanupBoundaryTests(unittest.TestCase):
 def test_mixed_or_rollback_backend_never_starts_a_cleanup_container(self):
  current=backend();run=Mock();peer=backend();peer['Image']='sha256:'+'b'*64
  self.assertEqual(module.execute_cleanup(current,peer,run)['status'],'SKIPPED');run.assert_not_called()
  run.return_value=subprocess.CompletedProcess([],1)
  self.assertEqual(module.execute_cleanup(current,current,run)['reason'],'COMPATIBLE_ROLLBACK_WITHOUT_CLEANUP_CLI');self.assertEqual(run.call_count,1)
 def test_environment_only_uses_stdin_and_retry_work_is_bounded(self):
  def execute(args,**kwargs):
   if 'run'in args:
    self.assertIn('--cpus=0.1',args);self.assertIn('--memory=128m',args);self.assertNotIn('synthetic-not-production',' '.join(args));self.assertIn('synthetic-not-production',kwargs['input'])
    return subprocess.CompletedProcess(args,0,json.dumps({'status':'SUCCESS','selected':4,'cleaned':3,'pending':1}),'')
   return subprocess.CompletedProcess(args,0,'','')
  self.assertEqual(module.execute_cleanup(backend(),backend(),execute)['pending'],1)
 def test_timed_out_container_is_removed_without_deleting_any_backup_or_host_data(self):
  calls=[]
  def execute(args,**kwargs):
   calls.append(args)
   if 'run'in args:raise subprocess.TimeoutExpired(args,75)
   return subprocess.CompletedProcess(args,0,'','')
  with self.assertRaises(subprocess.TimeoutExpired):module.execute_cleanup(backend(),backend(),execute)
  self.assertEqual(calls[-1][:3],['docker','rm','-f']);self.assertTrue(calls[-1][-1].startswith('eduk12-upload-cleanup-'))
if __name__=='__main__':unittest.main()
