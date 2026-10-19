/** New archive composition contracts only. Synthetic facts and mocked I/O;
 * no live evidence, large files, tar/extraction, PG, service or archive runs.
 * Preparing this file does not execute any check.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'
import {pythonProgram,ARCHIVE_PYTHON,parseArchiveArgs,archivePythonArgv} from './c25-analysis-resume-archive.mjs'

function contract(body){
 const harness="import json,sys\nfrom unittest import mock\npayload=json.load(sys.stdin)\nscope={'__name__':'analysis_archive_contract','SOURCE_TEXT':payload['source']}\nwith mock.patch('subprocess.Popen',side_effect=AssertionError('definition import spawned')):\n exec(compile(payload['source'],'<actual-analysis-archive>','exec'),scope)\nexec(compile(payload['body'],'<analysis-archive-contract>','exec'),scope)\n"
 const result=spawnSync(process.env.C25_TEST_PYTHON??'python3',['-B','-c',harness],{input:JSON.stringify({source:pythonProgram,body}),encoding:'utf8',timeout:20000,maxBuffer:1024*1024,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',TZ:'UTC',PYTHONDONTWRITEBYTECODE:'1'}})
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr||result.stdout)
}

test('partial archive rejects invented final counts and binds failed analysis plus every older manifest',()=>contract(String.raw`
import copy
from unittest import mock
target=OUTPUT/NAMES['descriptor'];head='b'*40;expected='a'*64
def binding(path):return {'path':str(path),'bytes':1,'mode':0o600,'sha256':expected if Path(path)==target else 'c'*64}
data={name:[{'path':'.','type':'directory'}] for name in DATA_DIRS}
full=[{'path':'.','type':'directory'},*({'path':name,'type':'directory'} for name in DATA_DIRS)];frozen=full[:1]
prior=[{'historical':'false continuation01'}];core=[{'accepted':'passed continuation02'}];historical={str(root):[{'kept':str(root)}] for root in HISTORICAL_ROOTS}
historical_failures={'http01':{'passed':False},'continuation01':{'passed':False}};accepted_core={'passed':True,'snapshot':CORE_SNAPSHOT};failed_analysis={'failureReceiptSha256':FAILED_RECEIPT_SHA,'inheritedFailure':{'failedReceiptPassed':False,'failedFinalSnapshotVerified':False,'currentDatabaseStateNotYetObserved':True}};producer={'bound':'final HEAD'}
flags={key:True for key in ['roundTripVerified','sourceUnchangedDuringArchive','nonDataEvidencePreserved','priorContinuationEvidencePreserved','coreContinuationEvidencePreserved','historicalRecoveryMaterialsPreserved','rawSourceRetained','restoreMaterialFsynced']};flags.update(servicesStarted=False,durableBackup=False)
files={name:binding(OUTPUT/NAMES[name]) for name in set(NAMES)-{'archive','descriptor'}}
archive=binding(OUTPUT/NAMES['archive']);physical=binding(FROZEN_PARTIAL_MANIFEST);stopped={'clusterState':'shut down'}
receipt={'scope':SCOPE,'passed':True,'frozenFailurePhysicalManifest':physical,'archive':archive,'producer':producer,'acceptedCorePassed':True,'acceptedCoreScope':CORE_SCOPE,'coreReceiptSha256':CORE_RECEIPT,'coreSnapshotSha256':CORE_SNAPSHOT,'symlinkCount':0,'hardlinkGroups':[],'manifestSha256':files['dataManifest']['sha256'],'sourceEvidenceSha256':files['frozenSourceManifest']['sha256'],'coreEvidenceSha256':files['coreContinuationManifest']['sha256'],'temporaryVerificationCopyRemoved':True,**flags}
value={'schemaVersion':3,'scope':SCOPE,'frozenFailurePhysicalManifest':physical,'sourceRoot':str(SOURCE),'priorContinuationRoot':str(PRIOR),'coreContinuationRoot':str(CORE),'acceptedCorePassed':True,'acceptedCoreScope':CORE_SCOPE,'coreReceiptSha256':CORE_RECEIPT,'coreSnapshotSha256':CORE_SNAPSHOT,'observedTables':None,'observedRows':None,'observedCheckpoints':None,'inheritedCoreRows':6667,'inheritedCoreCheckpoints':21,'failedAnalysis':failed_analysis,'failureReceiptSha256':FAILED_RECEIPT_SHA,'allowedMutableRoots':list(DATA_DIRS),'priorReceiptSha256':PRIOR_RECEIPT,'priorSnapshotSha256':PRIOR_SNAPSHOT,'head':head,'producer':producer,'historicalFailureFiles':historical_failures,'acceptedCore':accepted_core,'http03Descriptor':binding(Path('/tmp/new-source/descriptor.json')),'files':files,'archive':archive,'stoppedEvidence':stopped,**flags}
objects={'dataManifest':data,'fullSourceManifest':full,'frozenSourceManifest':frozen,'priorContinuationManifest':prior,'coreContinuationManifest':core,'historicalRecoveryManifest':historical,'archiveReceipt':receipt}
def read(path,*args,**kwargs):
 if path==target:return json.dumps(value)
 if path==OUTPUT/NAMES['restoreInstructions']:return 'synthetic instructions'
 return json.dumps(next(item for name,item in objects.items() if path==OUTPUT/NAMES[name]))
overrides={'canonical':lambda p:Path(p),'private_directory':lambda p:p,'file_binding':binding,'producer_binding':lambda *args:producer,'validate_historical_failures':lambda:historical_failures,'validate_core':lambda *args:accepted_core,'validate_failed_analysis':lambda *args:failed_analysis,'assert_frozen_partial_source':lambda actual:physical if actual==full else (_ for _ in ()).throw(AssertionError('drift')),'nondata_manifest':lambda p:frozen,'inventory':lambda p:prior if p==PRIOR else core,'historical_recovery_manifest':lambda:historical,'restore_instructions':lambda:'synthetic instructions','data_manifests':mock.Mock(side_effect=AssertionError('live data read forbidden')),'stopped_current':mock.Mock(side_effect=AssertionError('live PG inspection forbidden'))}
with mock.patch.dict(globals(),overrides),mock.patch.object(Path,'read_text',read),mock.patch('os.path.lexists',return_value=False):
 assert verify_recovery_descriptor(target,expected,Path('/tools'),SOURCE,head,check_data=False)==value
 overrides['data_manifests'].assert_not_called();overrides['stopped_current'].assert_not_called()
 for key,bad in [('schemaVersion',2),('acceptedCorePassed',False),('acceptedCoreScope','fresh full pass'),('coreReceiptSha256','0'*64),('coreSnapshotSha256','0'*64),('observedRows',6667),('observedTables',217),('inheritedCoreRows',6651),('failureReceiptSha256','0'*64),('failedAnalysis',{'passed':True}),('observedCheckpoints',20),('coreContinuationEvidencePreserved',False)]:
  old=value[key];value[key]=bad
  try:verify_recovery_descriptor(target,expected,Path('/tools'),SOURCE,head,check_data=False)
  except AssertionError:pass
  else:raise AssertionError('invalid descriptor field accepted: '+key)
  finally:value[key]=old
 for name in ['priorContinuationManifest','coreContinuationManifest','historicalRecoveryManifest','frozenSourceManifest']:
  old=objects[name];objects[name]=['changed immutable evidence']
  try:verify_recovery_descriptor(target,expected,Path('/tools'),SOURCE,head,check_data=False)
  except AssertionError:pass
  else:raise AssertionError('immutable manifest drift accepted: '+name)
  finally:objects[name]=old
 with mock.patch.dict(globals(),{'data_manifests':lambda p:data,'stopped_current':lambda t:stopped}):assert verify_recovery_descriptor(target,expected,Path('/tools'),SOURCE,head,check_data=True)==value
 with mock.patch('os.path.lexists',side_effect=lambda p:Path(p)==OUTPUT/'archive-failure-private.json'):
  try:verify_recovery_descriptor(target,expected,Path('/tools'),SOURCE,head,check_data=False)
  except AssertionError:pass
  else:raise AssertionError('failed publication accepted')
`))


test('resume archive keeps the old destination immutable and names current state as unobserved',()=>{
 const options={python:'/usr/bin/python3',tools:'/workspace/scratch/5a77e8bdc1ae/eduk12_tools_20261018',output:'/tmp/c25-analysis-resume-recovery-01',descriptor:'/tmp/new-source/descriptor.json','expected-head':'a'.repeat(40),'expected-descriptor-sha256':'b'.repeat(64)}
 const argv=value=>Object.entries(value).flatMap(([k,v])=>['--'+k,v]);assert.deepEqual(parseArchiveArgs(argv(options)),options)
 assert.throws(()=>parseArchiveArgs(argv({...options,output:'/tmp/c25-analysis-recovery-01'})))
 contract("assert OUTPUT==Path('/tmp/c25-analysis-resume-recovery-01')\nassert FAILED_ANALYSIS in HISTORICAL_ROOTS\nassert Path('/tmp/c25-analysis-recovery-01') in HISTORICAL_ROOTS\nassert 'current logical row count has not been observed' in restore_instructions()\nassert A['FLOOR']==8*1024**3 and A['RESERVE']==512*1024**2")
})


test('frozen failed physical manifest rejects between-run additions, deletion, bytes and metadata drift before archive creation',()=>contract(String.raw`
import ast,copy
from unittest import mock
expected=[{'path':'.','type':'directory','mode':448,'uid':1000,'gid':1000,'mtimeNs':1,'xattrs':{},'linkTarget':None}, {'path':'pgdata/data','type':'file','mode':384,'uid':1000,'gid':1000,'mtimeNs':2,'xattrs':{},'linkTarget':None,'size':3,'sha256':'a'*64,'links':1}]
original={'path':str(FROZEN_PARTIAL_MANIFEST),'mode':0o600,'sha256':FROZEN_PARTIAL_MANIFEST_SHA,'bytes':123}
with mock.patch.dict(globals(),{'file_binding':lambda path:copy.deepcopy(original)}),mock.patch.object(Path,'read_text',return_value=json.dumps(expected)):
 assert assert_frozen_partial_source(copy.deepcopy(expected))==original
 for mutate in [lambda x:x.append({'path':'pgdata/unapproved','type':'file'}),lambda x:x.pop(),lambda x:x[1].update(sha256='b'*64),lambda x:x[1].update(mtimeNs=3),lambda x:x[0].update(mode=493),lambda x:x[1].update(links=2),lambda x:x[1].update(xattrs={'acl':'changed'})]:
  value=copy.deepcopy(expected);mutate(value)
  try:assert_frozen_partial_source(value)
  except AssertionError:pass
  else:raise AssertionError('between-run physical drift accepted')
 for key,bad in [('sha256','c'*64),('mode',0o644)]:
  changed={**original,key:bad}
  with mock.patch.dict(globals(),{'file_binding':lambda path:changed}):
   try:assert_frozen_partial_source(expected)
   except AssertionError:pass
   else:raise AssertionError('historical manifest identity drift accepted')
 with mock.patch.dict(globals(),{'file_binding':mock.Mock(side_effect=[original,{**original,'bytes':124}])}):
  try:assert_frozen_partial_source(expected)
  except AssertionError:pass
  else:raise AssertionError('manifest read race accepted')
main=next(n for n in ast.parse(SOURCE_TEXT).body if isinstance(n,ast.FunctionDef) and n.name=='main');text=ast.unparse(main)
assert text.index('assert_frozen_partial_source(full)')<text.index('output.mkdir(')<text.index("run(['/usr/bin/tar'")
assert "value['frozenFailurePhysicalManifest'] == receipt['frozenFailurePhysicalManifest'] == assert_frozen_partial_source(full)" in ast.unparse(next(n for n in ast.parse(SOURCE_TEXT).body if isinstance(n,ast.FunctionDef) and n.name=='verify_recovery_descriptor'))
`))
