/** New archive composition contracts only. Synthetic facts and mocked I/O;
 * no live evidence, large files, tar/extraction, PG, service or archive runs.
 * Preparing this file does not execute any check.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'
import {pythonProgram,ARCHIVE_PYTHON,parseArchiveArgs,archivePythonArgv} from './c25-analysis-archive.mjs'

function contract(body){
 const harness="import json,sys\nfrom unittest import mock\npayload=json.load(sys.stdin)\nscope={'__name__':'analysis_archive_contract','SOURCE_TEXT':payload['source']}\nwith mock.patch('subprocess.Popen',side_effect=AssertionError('definition import spawned')):\n exec(compile(payload['source'],'<actual-analysis-archive>','exec'),scope)\nexec(compile(payload['body'],'<analysis-archive-contract>','exec'),scope)\n"
 const result=spawnSync(process.env.C25_TEST_PYTHON??'python3',['-B','-c',harness],{input:JSON.stringify({source:pythonProgram,body}),encoding:'utf8',timeout:20000,maxBuffer:1024*1024,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',TZ:'UTC',PYTHONDONTWRITEBYTECODE:'1'}})
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr||result.stdout)
}

test('analysis archive uses an exact new destination and injected producer bindings without running tools',()=>{
 const options={python:'/usr/bin/python3',tools:'/workspace/scratch/5a77e8bdc1ae/eduk12_tools_20261018',output:'/tmp/c25-analysis-recovery-01',descriptor:'/tmp/new-http03/source-descriptor.json','expected-head':'a'.repeat(40),'expected-descriptor-sha256':'b'.repeat(64)}
 const argv=value=>Object.entries(value).flatMap(([key,item])=>['--'+key,item])
 assert.equal(ARCHIVE_PYTHON,pythonProgram);assert.deepEqual(parseArchiveArgs(argv(options)),options)
 for(const [key,value] of [['output','/tmp/c25-missing-recovery-01'],['output','/tmp/c25-continuation-recovery-01'],['output','/tmp/c25-analysis-recovery-02'],['descriptor','/tmp/../tmp/source'],['python','python3'],['expected-head','wrong'],['expected-descriptor-sha256','wrong']])assert.throws(()=>parseArchiveArgs(argv({...options,[key]:value})))
 assert.throws(()=>parseArchiveArgs([...argv(options),'--output',options.output]));assert.throws(()=>parseArchiveArgs(argv({...options,extra:'ignored'})))
 const bindings={producerSha256:'c'.repeat(64),inlineSha256:'d'.repeat(64),pythonSha256:'e'.repeat(64)},command=archivePythonArgv(options,bindings)
 assert.deepEqual(command.slice(0,3),['-B','-c',pythonProgram]);assert.equal(command.filter(x=>x===pythonProgram).length,1)
 assert.equal(command[command.indexOf('--output')+1],options.output);assert.equal(command[command.indexOf('--expected-python-sha256')+1],bindings.pythonSha256)
 assert.throws(()=>archivePythonArgv(options,{...bindings,inlineSha256:'unbound'}))
})

test('accepted 6667-row core remains passed only in its exact composed scope and retains all three baselines',()=>contract(String.raw`
import copy
phases=['missing-open','missing-probe','missing-consumers','missing-guards','missing-restore']
counts={'training_attempt_checkpoints':21,'composite_report_jobs':148,'export_batches':42,'export_artifacts':42,'submission_idempotency_receipts':0,'checkin_submission_idempotency_receipts':0}
counts.update({str(n):0 for n in range(211)});counts['0']=6667-sum(counts.values())
snapshot={'columns':{name:[] for name in counts},'columnMetadata':{name:[] for name in counts},'projection':{name:{'rows':rows} for name,rows in counts.items()}}
receipt={'schemaVersion':1,'passed':True,'scope':CORE_SCOPE,'mutableDataRoot':str(SOURCE),'priorContinuationSource':str(PRIOR),'executedPhases':phases,'phases':{name:{'phase':name,'passed':True} for name in phases},'finalSnapshotSha256':CORE_SNAPSHOT,'apiLifetime':{'stopped':True,'expired':False,'restartAllowed':False},'processExits':{str(n):0 for n in range(16)}}
for key in ['apiStoppedAfterProbe','requestedPrefixPassed','finalSnapshotVerified','allPriorRowsPreserved','cleanupVerified','sourceUnchanged','inputsUnchanged','failureEvidenceUnchanged','priorContinuationEvidenceUnchanged','recoveryArchiveVerified']:receipt[key]=True
retained={'retainedFacts':{'allOriginalRowsRetained':True,'oldRows':6529,'originalCheckpointRowsRetained':16},'continuationRetainedFacts':{'allFailedRowsRetained':True,'oldRows':6582,'checkpointRows':17},'missingRetainedFacts':{'allSecondFailedRowsRetained':True,'oldRows':6651,'checkpointRows':20}}
audit={'passed':True,'mode':'final','snapshotSha256':CORE_SNAPSHOT,**copy.deepcopy(retained)}
receipt['finalOriginalRowsPreserved']=copy.deepcopy(audit['retainedFacts'])
restore={'passed':True,'phase':'missing-restore','currentRows':6667,**copy.deepcopy(retained),'restoredFullRows':{'firstFailedRunFullRowsRetained':6582,'secondFailedRunFullRowsRetained':6651,'originalHTTP03FullRowsRetained':6529,'allPostContinuationFullRowsEqual':True,'tables':217,'postContinuationRows':6667}}
status={'state':'stopped','cleanupVerified':True,'cleanupErrors':[],'pids':dict.fromkeys(['postgres','redis','api'],123456789),'ports':dict.fromkeys(['postgres','redis','api'],50001)}
baseline=(receipt,snapshot,audit,restore,status);validate_core_facts(*baseline)
for fault in ['false','old-scope','phase','rows','checkpoints','metadata','original','original-bool','first-failed','second-failed','restore','cleanup','exit-bool','restart','physical-root']:
 r,s,a,x,t=copy.deepcopy(baseline)
 if fault=='false':r['passed']=False
 elif fault=='old-scope':r['scope']='C25_EXPLICIT_CONTINUATION_INHERITED_UPGRADE_A_NOT_A_FRESH_RUN_OR_CAPACITY'
 elif fault=='phase':r['phases']['missing-open']['passed']=False
 elif fault=='rows':s['projection']['0']['rows']-=1
 elif fault=='checkpoints':s['projection']['training_attempt_checkpoints']['rows']-=1;s['projection']['0']['rows']+=1
 elif fault=='metadata':s['columnMetadata'].pop('0')
 elif fault=='original':a['retainedFacts']['oldRows']=0
 elif fault=='original-bool':r['finalOriginalRowsPreserved']=True
 elif fault=='first-failed':a['continuationRetainedFacts']['checkpointRows']=0
 elif fault=='second-failed':x['missingRetainedFacts']['oldRows']=0
 elif fault=='restore':x['restoredFullRows']['allPostContinuationFullRowsEqual']=False
 elif fault=='cleanup':t['cleanupErrors'].append('unreaped process')
 elif fault=='exit-bool':r['processExits']['0']=False
 elif fault=='restart':r['apiLifetime']['restartAllowed']=True
 else:r['mutableDataRoot']=str(CORE)
 try:validate_core_facts(r,s,a,x,t)
 except AssertionError:pass
 else:raise AssertionError('invalid accepted core facts: '+fault)
`))

test('descriptor validation preserves independent accepted-core and historical manifests even during live-data reuse',()=>contract(String.raw`
import copy
from unittest import mock
target=OUTPUT/NAMES['descriptor'];head='b'*40;expected='a'*64
def binding(path):return {'path':str(path),'bytes':1,'mode':0o600,'sha256':expected if Path(path)==target else 'c'*64}
data={name:[{'path':'.','type':'directory'}] for name in DATA_DIRS}
full=[{'path':'.','type':'directory'},*({'path':name,'type':'directory'} for name in DATA_DIRS)];frozen=full[:1]
prior=[{'historical':'false continuation01'}];core=[{'accepted':'passed continuation02'}];historical={str(root):[{'kept':str(root)}] for root in HISTORICAL_ROOTS}
historical_failures={'http01':{'passed':False},'continuation01':{'passed':False}};accepted_core={'passed':True,'snapshot':CORE_SNAPSHOT};producer={'bound':'final HEAD'}
flags={key:True for key in ['roundTripVerified','sourceUnchangedDuringArchive','nonDataEvidencePreserved','priorContinuationEvidencePreserved','coreContinuationEvidencePreserved','historicalRecoveryMaterialsPreserved','rawSourceRetained','restoreMaterialFsynced']};flags.update(servicesStarted=False,durableBackup=False)
files={name:binding(OUTPUT/NAMES[name]) for name in set(NAMES)-{'archive','descriptor'}}
archive=binding(OUTPUT/NAMES['archive']);stopped={'clusterState':'shut down'}
receipt={'scope':SCOPE,'passed':True,'archive':archive,'producer':producer,'acceptedCorePassed':True,'acceptedCoreScope':CORE_SCOPE,'coreReceiptSha256':CORE_RECEIPT,'coreSnapshotSha256':CORE_SNAPSHOT,'symlinkCount':0,'hardlinkGroups':[],'manifestSha256':files['dataManifest']['sha256'],'sourceEvidenceSha256':files['frozenSourceManifest']['sha256'],'coreEvidenceSha256':files['coreContinuationManifest']['sha256'],'temporaryVerificationCopyRemoved':True,**flags}
value={'schemaVersion':3,'scope':SCOPE,'sourceRoot':str(SOURCE),'priorContinuationRoot':str(PRIOR),'coreContinuationRoot':str(CORE),'acceptedCorePassed':True,'acceptedCoreScope':CORE_SCOPE,'coreReceiptSha256':CORE_RECEIPT,'coreSnapshotSha256':CORE_SNAPSHOT,'observedTables':217,'observedRows':6667,'observedCheckpoints':21,'allowedMutableRoots':list(DATA_DIRS),'priorReceiptSha256':PRIOR_RECEIPT,'priorSnapshotSha256':PRIOR_SNAPSHOT,'head':head,'producer':producer,'historicalFailureFiles':historical_failures,'acceptedCore':accepted_core,'http03Descriptor':binding(Path('/tmp/new-source/descriptor.json')),'files':files,'archive':archive,'stoppedEvidence':stopped,**flags}
objects={'dataManifest':data,'fullSourceManifest':full,'frozenSourceManifest':frozen,'priorContinuationManifest':prior,'coreContinuationManifest':core,'historicalRecoveryManifest':historical,'archiveReceipt':receipt}
def read(path,*args,**kwargs):
 if path==target:return json.dumps(value)
 if path==OUTPUT/NAMES['restoreInstructions']:return 'synthetic instructions'
 return json.dumps(next(item for name,item in objects.items() if path==OUTPUT/NAMES[name]))
overrides={'canonical':lambda p:Path(p),'private_directory':lambda p:p,'file_binding':binding,'producer_binding':lambda *args:producer,'validate_historical_failures':lambda:historical_failures,'validate_core':lambda *args:accepted_core,'nondata_manifest':lambda p:frozen,'inventory':lambda p:prior if p==PRIOR else core,'historical_recovery_manifest':lambda:historical,'restore_instructions':lambda:'synthetic instructions','data_manifests':mock.Mock(side_effect=AssertionError('live data read forbidden')),'stopped_current':mock.Mock(side_effect=AssertionError('live PG inspection forbidden'))}
with mock.patch.dict(globals(),overrides),mock.patch.object(Path,'read_text',read),mock.patch('os.path.lexists',return_value=False):
 assert verify_recovery_descriptor(target,expected,Path('/tools'),SOURCE,head,check_data=False)==value
 overrides['data_manifests'].assert_not_called();overrides['stopped_current'].assert_not_called()
 for key,bad in [('schemaVersion',2),('acceptedCorePassed',False),('acceptedCoreScope','fresh full pass'),('coreReceiptSha256','0'*64),('coreSnapshotSha256','0'*64),('observedRows',6651),('observedCheckpoints',20),('coreContinuationEvidencePreserved',False)]:
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

test('new coordinator preserves the reviewed library, full restore, aggregate deadline and only-new-copy cleanup',()=>contract(String.raw`
import ast
for name in ['inventory','nondata_manifest','file_binding','tool_binding','node_tool_bindings','assert_tools_unchanged','ResourceGuard','recovery_budget','bounded','fsync_tree','archive_members']:assert globals()[name] is A[name],name
assert A['FLOOR']==8*1024**3 and A['RESERVE']==512*1024**2 and A['MEMORY']==2*1024**3
assert DATA_DIRS==('pgdata','uploads','exports') and OUTPUT==Path('/tmp/c25-analysis-recovery-01')
assert set(HISTORICAL_ROOTS)=={Path('/tmp/c25-source-05'),Path('/tmp/c25-source-06'),Path('/tmp/c25-continuation-recovery-01'),Path('/tmp/c25-missing-recovery-01')}
assert CORE.name=='eduk12_c25_continuation_02' and SOURCE.name=='eduk12_c25_http_01'
nodes=ast.parse(SOURCE_TEXT).body;main=next(n for n in nodes if isinstance(n,ast.FunctionDef) and n.name=='main');text=ast.unparse(main)
for term in ['signal.setitimer(signal.ITIMER_REAL, 600)','fsync_tree(restore)','data_manifests(restore) == data','stopped_current(tools) == stopped','inventory(CORE) == core','historical_recovery_manifest() == historical','source.validate_descriptor','bounded(argv','pgControldataSha256','--acls','--xattrs-include=*','--same-permissions']:
 assert term in text,term
removals=[ast.unparse(n) for n in ast.walk(main) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr in ['rmtree','unlink','remove']]
assert removals==['shutil.rmtree(restore)'],removals
assert text.index('fsync_tree(restore)')<text.index('shutil.rmtree(restore)')<text.index("sync_json(output / NAMES['descriptor'], value)")
assert 'sourceOverallPassed' not in text and "'acceptedCorePassed': True" in text
try:output_path(Path('/tmp/c25-missing-recovery-01'),Path('/tmp/new/descriptor.json'))
except AssertionError:pass
else:raise AssertionError('old archive destination accepted')
`))
