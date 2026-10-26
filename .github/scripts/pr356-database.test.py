"""Controller contracts only: temporary files and fake executors; no real DB/app."""
import importlib.util
import io
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

SPEC=importlib.util.spec_from_file_location('pr356_database',Path(__file__).with_name('pr356-database.py'))
DB=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(DB)

class FakeRunner(DB.Runner):
 def execute(self,label,args,**kwargs):
  self.calls=getattr(self,'calls',[])+[(label,[str(x) for x in args],kwargs)]
  if args[0]=='git':
   if args[1:]==('rev-parse','HEAD') or list(args[1:])==['rev-parse','HEAD']:return 'a'*40
   if args[1]=='rev-parse':return 'b'*40
   if args[1]=='ls-tree':return self.tree
  if label.startswith('verify-official-'):return json.dumps({'proofPath':str(self.proof_path),'verificationReceipt':str(self.verification_path)})
  if kwargs.get('output'):kwargs['output'].write_bytes(b'synthetic controller bytes')
  return '' if kwargs.get('capture') else None

class Contracts(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='pr356-database-control-');self.addCleanup(self.temp.cleanup)
  self.base=Path(self.temp.name);self.root=self.base/'checkout';self.root.mkdir();self.runner_temp=self.base/'runner';self.runner_temp.mkdir()
  scripts=self.root/'.github/scripts';scripts.mkdir(parents=True)
  DB.save(scripts/'pr356-bindings.json',{'repository':'caohuibj/eduK12-new-version','base':'c'*40,'components':{'backend':'b'*40,'frontend':'b'*40}})
  self.source=self.root/'source.ts';self.source.write_text('export const value=1\n')
  self.blob=hashlib.sha1(b'blob '+str(self.source.stat().st_size).encode()+b'\0'+self.source.read_bytes()).hexdigest()
  self.inputs={'schemaVersion':1,'files':[{'path':'source.ts','mode':'100644','blob':self.blob}],'configuration':{'port':55439},'tools':{'node':'24.21.0'},'dependencies':{'lock':'bound'}}
  self.inputs_path=self.runner_temp/'inputs.json';DB.save(self.inputs_path,self.inputs)
 def env(self,phase):
  spec=self.runner_temp/(phase+'-spec.json');DB.save(spec,{'id':phase,'inputs':self.inputs,'inputsSHA256':hashlib.sha256(DB.canonical(self.inputs)).hexdigest(),'jobName':'pr356-'+phase,'caseIds':DB.CASE_IDS[phase]})
  return {'PR356_PHASE_SPEC':str(spec),'CI':'true','NODE_ENV':'test','PR356_SCHEMA_ISOLATED':'1','GITHUB_JOB':'pr356-'+phase,'GITHUB_RUN_ID':'123','GITHUB_RUN_ATTEMPT':'2','GITHUB_SHA':'a'*40,'GITHUB_REPOSITORY':'caohuibj/eduK12-new-version','RUNNER_TEMP':str(self.runner_temp),'PR356_DATABASE_OUTPUT_DIR':str(self.runner_temp/phase),'PR356_PHASE_INPUTS':str(self.inputs_path),'DATABASE_URL':'postgresql://synthetic:unused@127.0.0.1:55439/pr356_ci_upgrade','PR356_POSTGRES_CONTAINER':'owned-synthetic-postgres'}
 def driver(self,phase):
  d=DB.DatabasePhase(phase,self.env(phase),self.root,FakeRunner);d.runner.tree='100644 blob '+self.blob+'\tsource.ts';return d
 def report(self,phase,source):
  return {'success':True,'numTotalTests':len(DB.CASE_IDS[phase]),'numPassedTests':len(DB.CASE_IDS[phase]),'numFailedTests':0,'numPendingTests':0,'numTodoTests':0,'testResults':[{'name':str(source),'status':'passed','assertionResults':[{'fullName':name,'status':'passed'} for name in DB.CASE_IDS[phase]]}]}
 def upstream(self,d,phase,files):
  directory=self.runner_temp/'verified-input';directory.mkdir();declared={}
  for name,data in files.items():
   (directory/name).write_bytes(data);declared[name]={'sha256':DB.sha(directory/name),'bytes':len(data)}
  proof={'schemaVersion':1,'kind':'pr356-phase-proof','phaseId':phase,'status':'success','source':{'repository':d.env['GITHUB_REPOSITORY'],'head':d.env['GITHUB_SHA'],'runId':d.env['GITHUB_RUN_ID'],'producerAttempt':1},'outputs':{'files':declared}}
  DB.save(directory/'phase-receipt.json',proof);spec=self.runner_temp/'upstream-spec.json';DB.save(spec,{'inputs':self.inputs})
  d.env.update(PR356_DATABASE_INPUT_DIR=str(directory),PR356_DATABASE_INPUT_PHASE_SPEC=str(spec),PR356_ARTIFACT_ID='42',PR356_ARTIFACT_DIGEST='sha256:'+'d'*64,PR356_PRODUCER_RUN='123',PR356_PRODUCER_ATTEMPT='1')
  d.runner.proof_path=directory/'phase-receipt.json';d.runner.verification_path=Path(str(directory)+'.verified.json')
  DB.save(d.runner.verification_path,{'kind':'pr356-official-artifact-validation','phaseId':phase,'role':phase,'source':proof['source'],'proofSHA256':DB.sha(d.runner.proof_path),'payloadFiles':declared,'directory':str(directory),'proofPath':str(d.runner.proof_path),'artifact':{'id':42,'digest':'sha256:'+'d'*64},'inputsSHA256':d.inputs_sha})
  return directory,proof
 def test_explicit_phase_and_owned_loopback_context_are_required(self):
  for change in [{'NODE_ENV':'production'},{'CI':'false'},{'GITHUB_JOB':'other'},{'DATABASE_URL':'postgresql://synthetic:unused@remote.invalid:55439/pr356_ci_upgrade'},{'DATABASE_URL':'postgresql://synthetic:unused@127.0.0.1:5432/pr356_ci_upgrade'},{'DOT356_STANDARD_AUTHORITY_CONTINUE':'1'},{'PR356_ORDINARY_RECEIPT_REPLAY_LEDGERS':'{}'}]:
   with self.subTest(change=change):
    env={**self.env('schema-upgrade'),**change};env['PR356_DATABASE_OUTPUT_DIR']=str(self.runner_temp/('out-'+str(len(list(self.runner_temp.iterdir())))))
    with self.assertRaises(ValueError):DB.DatabasePhase('schema-upgrade',env,self.root,FakeRunner)
 def test_output_must_be_new_under_runner_temp_without_symlinks(self):
  d=self.driver('schema-upgrade');sentinel=d.out/'kept';sentinel.write_text('original')
  with self.assertRaisesRegex(ValueError,'Existing phase output'):self.driver('schema-upgrade')
  self.assertEqual(sentinel.read_text(),'original')
  env=self.env('schema-restore');env['PR356_DATABASE_OUTPUT_DIR']=str(self.base/'outside')
  with self.assertRaisesRegex(ValueError,'escapes'):DB.DatabasePhase('schema-restore',env,self.root,FakeRunner)
  link=self.runner_temp/'linked';link.symlink_to(self.base,target_is_directory=True);env['PR356_DATABASE_OUTPUT_DIR']=str(link/'outside')
  with self.assertRaisesRegex(ValueError,'symlinks'):DB.DatabasePhase('schema-restore',env,self.root,FakeRunner)
 def test_actual_tree_blob_mode_and_worktree_bytes_are_checked(self):
  d=self.driver('schema-upgrade');d.bind_source()
  self.assertTrue((d.out/'inputs-validation-before.json').is_file())
  self.source.write_text('changed\n')
  with self.assertRaisesRegex(ValueError,'drift'):d.bind_source()
 def test_missing_or_empty_declared_inputs_cannot_produce_identity(self):
  for key in ['files','configuration','tools','dependencies']:
   bad={**self.inputs,key:[]}
   with self.subTest(key=key),self.assertRaises(ValueError):DB.validate_inputs(self.root,bad,{'source.ts':('100644',self.blob)})
 def test_official_verifier_is_called_again_without_download_or_boolean_shortcut(self):
  d=self.driver('schema-restore');directory,_=self.upstream(d,'schema-upgrade',{'synthetic-upgrade.dump':b'synthetic dump'})
  read=d.verify_input();self.assertEqual(read('synthetic-upgrade.dump'),directory/'synthetic-upgrade.dump')
  args=d.runner.calls[-1][1];self.assertIn('verify-local',args);self.assertIn('schema-upgrade',args);self.assertIn('--phase-spec',args);self.assertNotIn('download',args)
  (directory/'synthetic-upgrade.dump').write_bytes(b'changed')
  with self.assertRaisesRegex(ValueError,'changed after'):read('synthetic-upgrade.dump')
 def test_upstream_wrong_role_head_run_failed_receipt_or_missing_payload_is_rejected(self):
  d=self.driver('schema-restore');directory,proof=self.upstream(d,'schema-upgrade',{'synthetic-upgrade.dump':b'synthetic dump'})
  for change in [{'phaseId':'schema-restore'},{'status':'failure'},{'source':{**proof['source'],'head':'e'*40}},{'source':{**proof['source'],'runId':'999'}}]:
   with self.subTest(change=change):
    DB.save(directory/'phase-receipt.json',{**proof,**change})
    with self.assertRaisesRegex(ValueError,'identity mismatch'):d.verify_input()
  DB.save(directory/'phase-receipt.json',proof);read=d.verify_input()
  with self.assertRaisesRegex(ValueError,'missing'):read('not-declared.dump')
 def test_vitest_requires_exact_nonempty_full_case_set_and_zero_skips(self):
  source=self.root/'case.test.ts'
  for phase in ['vertical4','exact-worker1','ordinary-harness4']:
   report=self.report(phase,source);self.assertEqual(len(DB.validate_report(report,phase,source)),len(DB.CASE_IDS[phase]))
   for change in [{'numPendingTests':1},{'numTotalTests':0},{'numTodoTests':1},{'success':False}]:
    with self.subTest(phase=phase,change=change),self.assertRaises(ValueError):DB.validate_report({**report,**change},phase,source)
   report['testResults'][0]['assertionResults'][0]['fullName']='unrelated passing test'
   with self.assertRaisesRegex(ValueError,'identities'):DB.validate_report(report,phase,source)
 def test_each_completed_phase_is_not_implicitly_chained(self):
  for phase in ['schema-upgrade','schema-restore','vertical4','exact-worker1','ordinary-harness4']:
   with self.subTest(phase=phase):
    d=self.driver(phase);d.bind_source=Mock()
    def complete():d.checks=[{'id':name,'status':'passed'} for name in DB.CASE_IDS[phase]]
    d.schema_upgrade=Mock(side_effect=complete);d.schema_restore=Mock(side_effect=complete);d.journey=Mock(side_effect=complete)
    d.execute();self.assertEqual(d.schema_upgrade.call_count+d.schema_restore.call_count+d.journey.call_count,1)
    proof=d.proof('success',0);self.assertEqual(proof['phaseId'],phase);self.assertEqual(proof['command']['exitCode'],0);self.assertIsInstance(proof['source']['producerAttempt'],int);self.assertTrue(proof['outputs']['files']);self.assertNotIn('phase-receipt.json',proof['outputs']['files'])
 def exact_result(self,database):
  return {'schemaVersion':1,'kind':'pr356-real-exact-lazy-consumer','caseId':DB.CASE_IDS['exact-lazy-current-child'][0],'status':'passed','syntheticOnly':True,'assertions':[{'id':name,'status':'passed'} for name in DB.EXACT_LAZY_ASSERTIONS],
   'observed':{'databaseName':database,'parentId':'parent','itemId':'item','childId':'child','combinationReleaseId':'release','epoch':1,'combinationHash':'a'*64,'flowSnapshotHash':'b'*64,'slotSetHash':'c'*64,'compiledRuntimeHash':'d'*64,'sourceDefinitionHash':'e'*64,'materializedChildCount':1,'trialCount':3,'emergencyStopCount':0,'frozenInstruction':None,'useRevoked':True,'sourceWithdrawn':True,'newStartDenied':True}}
 def test_exact_lazy_new_consumer_runs_once_from_its_fresh_setup(self):
  d=self.driver('exact-lazy-current-child');d.bind_source=Mock();d.verify_input=Mock(return_value=Mock());d.restore_setup=Mock()
  def run(label,args,**kwargs):
   self.assertEqual(label,'actual-current-exact-child');self.assertTrue(str(args[-1]).endswith('pr356-exact-lazy-fixture.cjs'));self.assertNotIn('vitest',str(args));self.assertNotIn('-t',args)
   env=kwargs['env'];self.assertEqual(env['PR356_EXACT_LAZY_ISOLATED'],'1');self.assertEqual(env['ASSESSMENT_REPORT_ASYNC_ENABLED'],'false')
   name=env['DATABASE_URL'].rsplit('/',1)[1];self.assertRegex(name,r'^pr356_exact_lazy_test_[a-f0-9]{10}$')
   DB.save(d.out/'exact-lazy-result.json',self.exact_result(name))
  d.run=Mock(side_effect=run);d.execute()
  self.assertEqual(d.run.call_count,1);self.assertEqual(d.restore_setup.call_count,1);self.assertEqual(d.verify_input.call_count,1);self.assertEqual(d.bind_source.call_count,2)
  self.assertEqual(d.checks,[{'id':'actual-current-exact-child-materialization','status':'passed'}])
 def test_exact_lazy_partial_or_wrong_result_cannot_qualify(self):
  result=self.exact_result('owned')
  for change in [{'status':'failed'},{'assertions':result['assertions'][:-1]},{'observed':{**result['observed'],'materializedChildCount':0}},{'observed':{**result['observed'],'databaseName':'foreign'}},{'observed':{**result['observed'],'emergencyStopCount':1}}]:
   with self.subTest(change=change),self.assertRaises(ValueError):DB.validate_exact_lazy_result({**result,**change},'owned')
 def test_upstream_receipt_output_uses_verified_origin_not_environment_claims(self):
  d=self.driver('schema-restore');directory,proof=self.upstream(d,'schema-upgrade',{'synthetic-upgrade.dump':b'synthetic'})
  d.verify_input();origin=json.loads(d.runner.verification_path.read_text());record=d.proof('success',0)['outputs']['upstream'][0]
  self.assertEqual(record,{'phaseId':'schema-upgrade','role':'schema-upgrade','artifactId':str(origin['artifact']['id']),'runId':str(origin['source']['runId']),'producerAttempt':origin['source']['producerAttempt'],'proofSHA256':origin['proofSHA256'],'artifactDigest':origin['artifact']['digest'],'inputsSHA256':origin['inputsSHA256']})
  origin['proofSHA256']='f'*64;DB.save(d.runner.verification_path,origin)
  with self.assertRaisesRegex(ValueError,'receipt and payload differ'):d.verify_input()
 def test_restore_setup_is_only_setup_and_never_migrate_or_application_validation(self):
  d=self.driver('vertical4');files={}
  for name,data in {'setup-schema.dump':b'schema','migration-history.sql':b'migration metadata','migrations.json':json.dumps({'schemaVersion':1,'setupOnly':True,'applicationDataIncluded':False,'migrationCount':237,'migrations':['expected']}).encode()}.items():
   p=self.runner_temp/name;p.write_bytes(data);files[name]=p
  d.create_db=Mock();d.pg=Mock();d.migrations=Mock(return_value=['expected']);d.sql=Mock(return_value='0')
  d.restore_setup(files.__getitem__,'synthetic_one')
  d.create_db.assert_called_once_with('synthetic_one');self.assertEqual(d.pg.call_count,2);self.assertIn('--schema-only',d.pg.call_args_list[0].args);self.assertFalse(any('migrate' in str(call) for call in d.pg.call_args_list));self.assertEqual(d.checks,[])
 def test_ordinary_phase_uses_four_new_databases_and_one_unfiltered_file(self):
  d=self.driver('ordinary-harness4');d.verify_input=Mock(return_value=Mock());d.restore_setup=Mock()
  def fake_run(label,args,**kwargs):
   self.assertEqual(label,'whole-file-journey');self.assertNotIn('-t',args)
   env=kwargs['env'];urls=json.loads(env['PR356_ORDINARY_RECEIPT_DATABASE_URLS']);self.assertEqual(set(urls),{'single','batch','prestop','lockwait'});self.assertEqual(len(set(urls.values())),4);self.assertEqual(env['PR356_ORDINARY_RECEIPT_MODE'],'fresh')
   source=d.back/'src/__tests__/composite/pr356-ordinary-receipt.postgres.integration.test.ts';DB.save(d.out/'tests.json',self.report(d.phase,source))
  d.run=Mock(side_effect=fake_run);d.journey();self.assertEqual(d.restore_setup.call_count,4);self.assertEqual(d.run.call_count,1);self.assertEqual(len(d.checks),4)
 def test_wrapper_may_use_empty_output_or_only_exclusive_spec_and_inputs(self):
  for phase,prepared in [('schema-upgrade',False),('schema-restore',True)]:
   env=self.env(phase);out=Path(env['PR356_DATABASE_OUTPUT_DIR']);out.mkdir()
   if prepared:
    (out/'phase-spec.json').write_bytes(Path(env['PR356_PHASE_SPEC']).read_bytes());(out/'phase-inputs.json').write_bytes(self.inputs_path.read_bytes())
    env.update(PR356_PHASE_SPEC=str(out/'phase-spec.json'),PR356_PHASE_INPUTS=str(out/'phase-inputs.json'))
   d=DB.DatabasePhase(phase,env,self.root,FakeRunner);self.assertTrue((d.out/'phase.log').is_file())
   with self.assertRaisesRegex(ValueError,'Existing phase output'):DB.DatabasePhase(phase,env,self.root,FakeRunner)
 def test_post_phase_reads_actual_bytes_and_preserves_first_failure(self):
  d=self.driver('vertical4')
  def mutate():
   self.source.write_text('mutated while running\n');raise RuntimeError('original fake phase failure')
  d.journey=Mock(side_effect=mutate)
  with self.assertRaisesRegex(RuntimeError,'original fake phase failure'):d.execute()
  self.assertTrue((d.out/'post-input-validation-error.json').is_file());self.assertTrue((d.out/'inputs-validation-before.json').is_file())
 def test_binary_stdin_is_fingerprinted_without_copying_large_upstream_dump(self):
  out=self.runner_temp/'executor';out.mkdir();runner=DB.Runner(out,{})
  with patch.object(DB.subprocess,'run',return_value=subprocess.CompletedProcess(['not-executed'],0,stdout=b'')):
   runner.execute('setup-schema-restore',['not-executed'],cwd=self.root,stdin=b'synthetic-binary')
  receipt=json.loads((out/'commands/001-setup-schema-restore.json').read_text())
  self.assertEqual(receipt['stdinSHA256'],hashlib.sha256(b'synthetic-binary').hexdigest());self.assertEqual(receipt['stdinBytes'],16)
  self.assertFalse(list((out/'commands').glob('*.input')))
 def test_preflight_failure_retains_phase_exit_without_starting_any_process(self):
  env=self.env('schema-upgrade');env['DATABASE_URL']='postgresql://synthetic:unused@127.0.0.1:5432/pr356_ci_upgrade'
  with patch.dict(DB.os.environ,env,clear=True),patch.object(DB,'__file__',str(self.root/'.github/scripts/pr356-database.py')),patch.object(DB.subprocess,'run') as run,patch.object(DB.sys,'stderr',io.StringIO()):
   self.assertEqual(DB.main(['schema-upgrade']),1)
  run.assert_not_called();proof=json.loads((Path(env['PR356_DATABASE_OUTPUT_DIR'])/'phase-receipt.json').read_text())
  self.assertEqual(proof['status'],'failure');self.assertEqual(proof['command']['exitCode'],1);self.assertIn('Dedicated loopback',proof['reason'])
 def test_fake_subprocess_failure_retains_original_exit_and_log(self):
  out=self.runner_temp/'executor';out.mkdir();runner=DB.Runner(out,{})
  def fake(args,**kwargs):kwargs['stderr'].write(b'original fake error\n');return subprocess.CompletedProcess(args,17,stdout=b'')
  with patch.object(DB.subprocess,'run',side_effect=fake),self.assertRaisesRegex(ValueError,'failed'):runner.execute('intentional-fake',['not-executed'],cwd=self.root)
  receipt=json.loads((out/'commands/001-intentional-fake.json').read_text());self.assertEqual(receipt['exitCode'],17);self.assertIn(b'original fake error',(out/'commands/001-intentional-fake.log').read_bytes())

if __name__=='__main__':unittest.main()
