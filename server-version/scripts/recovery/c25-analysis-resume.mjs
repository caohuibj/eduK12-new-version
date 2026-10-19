/** C19 existing-jobs remaining analysis supplement. Archive and runtime each require separate GO.
 * Existing Python, products and producers are immutable. Importing is inert. */
import {spawn} from 'node:child_process'
import {fileURLToPath,pathToFileURL} from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
export const MATERIAL_PYTHON=String.raw`
import json,sys,subprocess,os
from pathlib import Path

def verify_old_materials(source,baseline,inventory):
    counts={'files':0,'bytes':0,'directories':0}
    for name in ['uploads','exports']:
        expected=baseline[name];assert expected and expected[0]['path']=='.' and expected[0]['type']=='directory'
        actual=inventory(source/name);indexed={row['path']:row for row in actual}
        assert len(indexed)==len(actual) and len({row['path'] for row in expected})==len(expected)
        for old in expected:
            assert old['path'] in indexed,'accepted attachment/export path was removed'
            current=indexed[old['path']]
            assert old['type'] in ['file','directory'] and current['type']==old['type']
            if old['type']=='file':
                assert current==old,'accepted attachment/export bytes or file metadata changed'
                counts['files']+=1;counts['bytes']+=old['size']
            else:
                # New artifact creation may change a parent directory's mtime;
                # its identity/type/mode/owner/xattrs and link prohibition stay.
                assert {k:v for k,v in current.items() if k!='mtimeNs'}=={k:v for k,v in old.items() if k!='mtimeNs'}
                counts['directories']+=1
    return {'passed':True,'allOldMaterialFilesRetained':True,'allowedNewFiles':True,'directoryMtimeExcluded':True,**counts}

def main():
    node,module,manifest,expected_sha,source,output=sys.argv[1:];source=Path(source);manifest=Path(manifest);output=Path(output)
    code="import {ARCHIVE_PYTHON} from "+json.dumps(Path(module).as_uri())+";process.stdout.write(ARCHIVE_PYTHON)"
    library=subprocess.check_output([node,'--input-type=module','-e',code],text=True,timeout=10)
    archive={'__name__':'analysis_material_archive_library'};exec(compile(library,module,'exec'),archive)
    assert source==archive['SOURCE'] and Path(module)==archive['PRODUCER']
    assert Path(node)==archive['ROOT']/'eduk12_tools_20261018/node_modules/node/bin/node'
    assert output==archive['ROOT']/'eduk12_c25_analysis_02/c25-analysis-resume-material-audit-result.json'
    assert manifest==archive['OUTPUT']/archive['NAMES']['dataManifest']
    binding=archive['file_binding'](manifest);assert binding['sha256']==expected_sha and binding['mode']==0o600
    baseline=json.loads(manifest.read_text())
    result=verify_old_materials(source,baseline,archive['inventory'])
    assert archive['file_binding'](manifest)==binding
    result['sourceDataManifest']=binding
    archive['sync_json'](output,result)
    print(json.dumps(result))
if __name__=='__main__':main()
`
export const ANALYSIS_PYTHON=String.raw`#!/usr/bin/env python3
"""C19 existing-jobs remaining analysis supplement; both failed receipts remain false and immutable.
Separate archive/runtime GO is required. No implicit retry or capacity claim.
"""
import argparse,fcntl,importlib.util,json,os,re,shutil,signal,socket,subprocess,sys,time,urllib.request
from pathlib import Path
from urllib.parse import urlparse
sys.dont_write_bytecode=True
BASE=Path(sys.argv.pop(1)).resolve()
def module(name,file):
 spec=importlib.util.spec_from_file_location(name,BASE/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
preflight=module('c25_contracts','c25-contracts.py')
source_contract=module('c25_source','c25-source.py')
REPO,BACKEND,FRONTEND=preflight.REPO,preflight.BACKEND,preflight.FRONTEND
sha_file,digest,manifest=preflight.sha_file,preflight.digest,source_contract.manifest
FLOOR=preflight.FLOOR
PHASES=['analysis-resume']
PHASE_SECONDS={'analysis-resume':300}
MATERIAL_PYTHON=${JSON.stringify(MATERIAL_PYTHON)}
CORE_RECEIPT_SHA='94949c13018705e3413f9cffa3aa810fc1d0720f173363f60cd16dffa96d76ba'
CORE_SNAPSHOT_SHA='2116f582580ab67d0c5f69330d73300b026a3eaeeacf94a47f268aa16b244e85'
def analysis_budget(free,memory,tmp_free):
 assert free>=FLOOR+preflight.RESERVE,'continuation needs unchanged 8GiB + 512MiB admission reserve'
 assert memory>=preflight.MEMORY and tmp_free>=preflight.RESERVE,'memory/tmp archive retention floor'
 return {'freeBytes':free,'cloneBytes':0,'reserveBytes':preflight.RESERVE,'projectedFreeAfterReserve':free-preflight.RESERVE,'memAvailableBytes':memory,'tmpFreeBytes':tmp_free}
def analysis_destination(value,root):
 state=Path(os.path.abspath(value));root=Path(root)
 assert state.parent==root and state.name=='eduk12_c25_analysis_02' and not state.exists()
 assert all(not part.is_symlink() for part in [state,*state.parents]),'continuation destination alias'
 return state
def analysis_complete(result):
 phase=result.get('phases',{}).get('analysis-resume',{})
 evidence=phase.get('analysisSupplement',{})
 proof=evidence.get('export',{}).get('proof',{})
 return (set(result.get('phases',{}))==set(PHASES) and result.get('executedPhases')==PHASES
  and phase.get('passed') is True and phase.get('phase')=='analysis-resume'
  and result.get('inheritedCore',{}).get('sourceRows')==6667 and result['inheritedCore'].get('sourceCheckpoints')==21
  and result['inheritedCore'].get('accepted',{}).get('inheritedRestoreRows')==6667
  and result.get('newDatabaseRestoreExecuted') is False
  and result.get('inheritedAnalysisFailure',{}).get('failedReceiptPassed') is False
  and result['inheritedAnalysisFailure'].get('failedFinalSnapshotVerified') is False
  and phase.get('executed')=={'attemptsCreatedThisRun':0,'finalsSubmittedThisRun':0,'coursesCreatedThisRun':0,'publicationsCreatedThisRun':0,'reportDrainInvocations':1,'reportJobsDrainedThisRun':3,'exportsEnqueuedThisRun':1}
  and evidence.get('publications')==2 and evidence.get('attempts')==3 and evidence.get('finals')==4
  and evidence.get('acceptedSnapshots')==4 and evidence.get('noCheckpointCreated') is True
  and evidence.get('originalScaleUnchanged') is True and evidence.get('newAcceptedFactsUnchangedAcrossConsumers') is True
  and evidence.get('suppression',{}).get('state')=='suppressed'
  and proof.get('rowCount')==4 and proof.get('columnCount')==24 and proof.get('pairedValidN')==1
  and proof.get('measuredValues')=={'MA':1,'MB':0} and proof.get('missingReasons')=={'SA':'NOT_ASSIGNED','SB':'NO_OBSERVATION'}
  and all(result.get(k) is True for k in ['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified','apiStoppedAfterAnalysis','failureEvidenceUnchanged','priorContinuationEvidenceUnchanged','coreEvidenceUnchanged','recoveryArchiveVerified','allPriorRowsPreserved','oldMaterialFilesPreserved'])
  and result.get('apiLifetime',{}).get('stopped') is True and result['apiLifetime'].get('expired') is False
  and result.get('protectedCoreFacts',{}).get('oldRows')==6667 and result['protectedCoreFacts'].get('checkpointRows')==21
  and result['protectedCoreFacts'].get('allCoreRowsRetained') is True
  and result['protectedCoreFacts'].get('allPartialRowsRetained') is True
  and result['protectedCoreFacts'].get('originalReportsBudgetRestoredExactly') is True
  and result['protectedCoreFacts'].get('nonlistedColumnsExact') is True
  and result['protectedCoreFacts'].get('acceptedUnitSnapshotsExact')==4
  and bool(result.get('processExits')) and all(type(code) is int and code==0 for code in result['processExits'].values()))


def main():
 os.umask(0o077)
 p=argparse.ArgumentParser(description=__doc__)
 for name in ['tools','descriptor','state','backend-receipt','frontend-receipt','failure-state','continuation-state','core-state','recovery-descriptor']:p.add_argument('--'+name,type=Path,required=True)
 for name in ['expected-descriptor-sha256','expected-head','expected-backend-receipt-sha256','expected-frontend-receipt-sha256','expected-recovery-sha256']:p.add_argument('--'+name,required=True)
 a=p.parse_args()
 assert re.fullmatch('[0-9a-f]{40}',a.expected_head)
 tools=a.tools.resolve();failed=a.failure_state.resolve();prior=a.continuation_state.resolve();core=a.core_state.resolve();state=analysis_destination(a.state,REPO.parent);requested=list(PHASES)
 assert failed==REPO.parent/'eduk12_c25_http_01','only this reviewed failed cluster may continue'
 assert prior==REPO.parent/'eduk12_c25_continuation_01','only the reviewed second failure may contribute subchecks'
 assert core==REPO.parent/'eduk12_c25_continuation_02','only accepted core6667 may precede this supplement'
 source_contract.destination_path(state,protected=[failed,prior,core,tools,a.recovery_descriptor.parent,a.descriptor.parent,REPO.parent/'eduk12_c21_http_01'])
 lock=(tools/'.measurement.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 node=tools/'node_modules/node/bin/node';pg=tools/'postgresql/bin';redis=tools/'redis/bin/redis-server'
 assert subprocess.check_output([node,'--version'],text=True,timeout=10).strip()=='v24.21.0'
 assert '16.15' in subprocess.check_output([pg/'postgres','--version'],text=True,timeout=10)
 assert 'v=7.4.11 ' in subprocess.check_output([redis,'--version'],text=True,timeout=10)
 descriptor=source_contract.validate_descriptor(a.descriptor,a.expected_descriptor_sha256,pg/'pg_controldata',destination=state)
 source=Path(descriptor['dataRoot']);evidence=Path(descriptor['evidenceRoot'])
 archive_file=BASE/'c25-analysis-resume-archive.mjs'
 archive_code=subprocess.check_output([node,'--input-type=module','-e',"import {ARCHIVE_PYTHON} from "+json.dumps(archive_file.as_uri())+";process.stdout.write(ARCHIVE_PYTHON)"],text=True,timeout=10)
 archive={'__name__':'c25_analysis_archive_library'};exec(compile(archive_code,str(archive_file),'exec'),archive)
 recovery=archive['verify_recovery_descriptor'](a.recovery_descriptor,a.expected_recovery_sha256,tools,failed,a.expected_head,check_data=True)
 assert sha_file(core/'c25-missing-result.json')==CORE_RECEIPT_SHA
 assert sha_file(core/'c25-missing-final-db-snapshot.json')==CORE_SNAPSHOT_SHA
 failure_nondata=archive['nondata_manifest'](failed)
 prior_evidence=archive['inventory'](prior);core_evidence=archive['inventory'](core)
 inherited=json.loads(subprocess.check_output([node,'--input-type=module','-e',"import {captureAnalysisFailure} from "+json.dumps((BASE/'c25-analysis-resume-contract.mjs').as_uri())+";process.stdout.write(JSON.stringify(captureAnalysisFailure()))"],text=True,timeout=30))
 assert REPO not in state.parents
 def validate_build():
  backend=preflight.validate_build(a.backend_receipt,a.expected_backend_receipt_sha256,'backend',a.expected_head,node)
  frontend=preflight.validate_build(a.frontend_receipt,a.expected_frontend_receipt_sha256,'frontend',a.expected_head,node)
  assert backend['prismaClientReceipt']==frontend['prismaClientReceipt'],'two producers must consume identical client verification'
  return backend,frontend
 backend_build,frontend_build=validate_build()
 memory=next(int(l.split()[1])*1024 for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:'))
 copybytes=0
 budget=analysis_budget(shutil.disk_usage(state.parent).free,memory,shutil.disk_usage('/tmp').free)
 runtime=json.loads((core/'runtime-private.json').read_text())
 for key,role in [('DATABASE_URL_OWNER','eduk12_owner'),('DATABASE_URL','eduk12_runtime'),('DATABASE_URL_RUNTIME','eduk12_runtime')]:
  u=urlparse(runtime[key]);assert u.hostname=='127.0.0.1' and u.username==role and u.path=='/eduk12_recovery'
 runtime.update(PUBLIC_ASSESSMENT_IP_GET_LIMIT='10000',PUBLIC_ASSESSMENT_IP_FINAL_LIMIT='10000',PUBLIC_ASSESSMENT_TOKEN_GET_LIMIT='10000',PUBLIC_ASSESSMENT_TOKEN_FINAL_LIMIT='10000',PUBLIC_ASSESSMENT_RECOVERY_GET_LIMIT='10000',PUBLIC_ASSESSMENT_RECOVERY_FINAL_LIMIT='10000',BACKGROUND_WORKERS_ENABLED='false',HEAVY_PROCESSING_ENABLED='false',VIDEO_PROCESSING_ENABLED='false',ASSESSMENT_REPORT_ASYNC_ENABLED='true',ASSESSMENT_WHOLE_SUBMIT_ENABLED='true',PERF_ISOLATED_TEST_MODE='1',PERF_SQL_EVENT_COUNT='1')
 effective={**runtime,'PORT':'0','REDIS_URL':'redis://127.0.0.1:0','UPLOAD_DIR':str(failed/'uploads'),'EXPORT_DIR':str(failed/'exports')}
 for key in ['DATABASE_URL_OWNER','DATABASE_URL','DATABASE_URL_RUNTIME']:
  u=urlparse(effective[key]);effective[key]=u._replace(netloc=f'{u.username}:{u.password}@127.0.0.1:0').geturl()
 env={'PATH':f'{node.parent}:{pg}:/usr/bin:/bin','HOME':str(state),'TMPDIR':str(state),'LANG':'C.UTF-8','TZ':'UTC','NODE_ENV':'test','PYTHONDONTWRITEBYTECODE':'1'}
 result={'schemaVersion':1,'passed':False,'scope':'C25_C19_EXISTING_THREE_JOBS_REMAINING_ANALYSIS_CSV_COMPOSITION','mutableDataRoot':str(failed),'priorContinuationSource':str(prior),'coreSource':str(core),'coreReceiptSha256':CORE_RECEIPT_SHA,'coreSnapshotSha256':CORE_SNAPSHOT_SHA,'inheritedCore':inherited['originalCore'],'inheritedAnalysisFailure':inherited['inheritedFailure'],'failureReceiptSha256':inherited['failureReceiptSha256'],'newDatabaseRestoreExecuted':False,'executedPhases':[],'recoveryDescriptorSha256':a.expected_recovery_sha256,'phases':{},'sourceReceiptSha256':source_contract.RECEIPT_SHA256,'sourceSnapshotSha256':source_contract.SNAPSHOT_SHA256,'descriptorSha256':a.expected_descriptor_sha256,'cloneBytes':copybytes,'budget':budget,'backendBuildReceiptSha256':a.expected_backend_receipt_sha256,'frontendBuildReceiptSha256':a.expected_frontend_receipt_sha256,'notCovered':['selected-video supplement and N=4/5 dynamic threshold boundary','native IndexedDB and C24 browser acceptance','CPU/throughput/capacity']}
 status={'state':'preparing','ports':{},'pids':{},'startedAt':time.time()};children=[];logs=[];pinned=before=None;cleanup=[];expected_stopped=set()
 def terminate_api_writers():
  result.update(passed=False,apiLifetimeExpired=True)
  for name,proc,_ in reversed(children):
   if name!='postgres' and proc.poll() is None:
    try:os.killpg(proc.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    result.setdefault('apiDeadlineKilledGroups',[]).append({'name':name,'pid':proc.pid})
 api_lifetime=preflight.ApiLifetime(time.monotonic,lambda seconds:signal.setitimer(signal.ITIMER_REAL,seconds),terminate_api_writers)
 signal.signal(signal.SIGALRM,api_lifetime.interrupt)
 def record():
  t=state/'status.tmp';t.write_text(json.dumps(status,indent=2));t.replace(state/'status.json')
 def receipt_references():
  refs={str(a.backend_receipt):sha_file(a.backend_receipt),str(a.frontend_receipt):sha_file(a.frontend_receipt),str(a.descriptor):sha_file(a.descriptor),str(a.recovery_descriptor):sha_file(a.recovery_descriptor),**{file:sha_file(Path(file)) for file in inherited['references']}}
  for receipt in [backend_build,frontend_build]:
   for item in [receipt['prismaClientReceipt'],*receipt['closureEvidence'].values()]:refs[item['path']]=sha_file(item['path'])
   refs[receipt['producerResultPath']]=sha_file(receipt['producerResultPath'])
  return refs
 def binding():
  assert not preflight.git('status','--porcelain'),'entire continuation candidate must remain clean'
  return {'head':preflight.git('rev-parse','HEAD').decode().strip(),'sourceInputs':preflight.source_inventory(),
   'backendInputs':preflight.component_inputs(BACKEND),'frontendInputs':preflight.component_inputs(FRONTEND),
   'backendDist':preflight.file_inventory(BACKEND,'dist'),'frontendDist':preflight.file_inventory(FRONTEND,'dist'),
   'backendDependenciesSha256':digest(preflight.dependency_inventory(BACKEND)),'frontendDependenciesSha256':digest(preflight.dependency_inventory(FRONTEND)),
   'generatedClient':preflight.file_inventory(BACKEND,'node_modules/.prisma/client'),
   'launcherPython':{'path':sys.executable,'realpath':str(Path(sys.executable).resolve()),'sha256':sha_file(Path(sys.executable).resolve()),'version':sys.version},
   'runtimeFingerprint':json.loads(subprocess.check_output([node,BASE/'runtime-fingerprint.cjs',BACKEND],text=True,timeout=30)),
   'tools':{str(v.relative_to(tools)):sha_file(v) for v in [node,pg/'postgres',pg/'psql',pg/'pg_dump',pg/'pg_restore',pg/'pg_controldata',redis]},
   'postgresLibraryBytes':{str(v.relative_to(tools)):{'realpath':str(v.resolve()),'sha256':sha_file(v)} for v in sorted((tools/'postgresql/lib').rglob('*')) if v.is_file()},
   'receiptReferences':receipt_references(),'runtimeConfigurationSha256':digest(effective),'phases':requested,'inlinePythonSha256':__import__('hashlib').sha256(sys.orig_argv[sys.orig_argv.index('-c')+1].encode()).hexdigest(),'archiveInlinePythonSha256':__import__('hashlib').sha256(archive_code.encode()).hexdigest()}
 def resources(label,retain=False):
  free=shutil.disk_usage(state).free;memory=next(int(l.split()[1])*1024 for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:'))
  result['minFreeBytes']=min(result.get('minFreeBytes',free),free);result['minMemAvailableBytes']=min(result.get('minMemAvailableBytes',memory),memory)
  if retain:result.setdefault('resources',[]).append({'stage':label,'at':time.time(),'freeBytes':free,'memAvailableBytes':memory})
  tmp_free=shutil.disk_usage('/tmp').free;result['minTmpFreeBytes']=min(result.get('minTmpFreeBytes',tmp_free),tmp_free)
  assert free>=FLOOR,'8GiB disk floor';assert memory>=preflight.MEMORY,'2GiB available-memory floor';assert tmp_free>=preflight.RESERVE,'512MiB tmp recovery archive floor'
 def guard():
  resources(status['state'])
  for name,proc,service in children:
   if service and name not in expected_stopped:assert proc.poll() is None,name+' exited'
   if name=='api' and proc.poll() is None:
    rss=next(int(l.split()[1])*1024 for l in Path(f'/proc/{proc.pid}/status').read_text().splitlines() if l.startswith('VmRSS:'));result['maxApiRssBytes']=max(result.get('maxApiRssBytes',0),rss);assert rss<1024**3
  if (state/'stop').exists():raise KeyboardInterrupt
 def start(argv,name,extra=None,service=True):
  log=(state/(name+'.log')).open('w');logs.append(log);proc=subprocess.Popen(list(map(str,argv)),cwd=BACKEND,env={**env,**(extra or {})},stdout=log,stderr=log,start_new_session=True);children.append((name,proc,service))
  if service:status['pids'][name]=proc.pid
  record();return proc
 def run(argv,name,extra=None,timeout=600,monitor=None):
  proc=start(argv,name,extra,False)
  try:preflight.wait_child(proc,timeout,monitor or guard)
  finally:(state/(name+'.exit')).write_text(str(proc.returncode)+'\n')
 def audit(mode,label,monitor=None):
  argv=[node,BASE/'c25-analysis-resume-db.mjs','--python',sys.executable,'--node',node,'--db-helper',BASE/'c25-db.py','--contract',BASE/'c25-analysis-resume-contract.mjs','--tools',tools,'--state',state,'--core-state',core,'--failure-state',REPO.parent/'eduk12_c25_analysis_01','--mode',mode,'--label',label]
  run(argv,label,timeout=300,monitor=monitor)
  evidence=json.loads((state/(label+'-result.json')).read_text())
  assert evidence['passed'] is True and evidence['mode']==mode
  protection=evidence['protectedCoreFacts']
  assert protection['checkpointRows']==21 and protection['allCheckpointRowsExact'] is True
  if mode=='baseline':
   assert protection['allOriginal6666RowsExact'] is True and protection['originalReportsRowExactExceptPending0To3'] is True
   assert protection['threeOriginalPendingJobsFullRowExact'] is True and protection['acceptedUnitSnapshotsExact']==4
  else:
   assert protection['allCoreRowsRetained'] is True and protection['oldRows']==6667
   assert protection['originalReportsBudgetRestoredExactly'] is True and protection['allPartialRowsRetained'] is True
   assert protection['exactParentCompletionTransitions']==protection['exactJobCompletionTransitions']==3
   assert protection['acceptedUnitSnapshotsExact']==4 and protection['nonlistedColumnsExact'] is True
   assert evidence['reportMaterializationProof']['authenticatedReports']==3 and evidence['reportMaterializationProof']['unchangedDecryptedPaths']==3
  if mode=='final':
   assert sha_file(state/'c25-analysis-resume-final-db-snapshot.json')==evidence['snapshotSha256']
   result['allPriorRowsPreserved']=True;result['protectedCoreFacts']=evidence['protectedCoreFacts']
  result.setdefault('auditProducers',{})[label]={'argv':list(map(str,argv)),'timeoutSeconds':300,'resultSha256':sha_file(state/(label+'-result.json'))}
  return evidence
 def ready(port,proc):
  deadline=time.monotonic()+60
  while time.monotonic()<deadline:
   guard()
   try:
    with socket.create_connection(('127.0.0.1',port),timeout=.3):
     executable=Path(f'/proc/{proc.pid}/exe').resolve();assert executable in [node.resolve(),(pg/'postgres').resolve(),redis.resolve()];result.setdefault('serviceExecutables',{})[str(proc.pid)]={'path':str(executable),'sha256':sha_file(executable)};return
   except OSError:time.sleep(.2)
  raise TimeoutError('readiness exceeded 60 seconds')
 def verify():
  assert sha_file(a.descriptor)==a.expected_descriptor_sha256
  source_contract.assert_unchanged(descriptor,pg/'pg_controldata')
  archive['verify_recovery_descriptor'](a.recovery_descriptor,a.expected_recovery_sha256,tools,failed,a.expected_head,check_data=False)
  assert archive['nondata_manifest'](failed)==failure_nondata,'failed-run nondata evidence changed'
  assert archive['inventory'](prior)==prior_evidence,'prior continuation evidence changed'
  assert archive['inventory'](core)==core_evidence,'accepted core evidence changed'
  assert preflight.accepted_binding(binding,validate_build,a.expected_head)==pinned,'frozen sources/artifacts/tools/config changed'
 def stop_child(name,proc):
  try:
   if name in ['postgres','redis','api'] and proc.poll() is not None and name not in expected_stopped:
    cleanup.append({'name':name,'error':'UnexpectedServiceExitBeforeShutdown'})
   if proc.poll() is None:
    os.killpg(proc.pid,signal.SIGINT if name=='postgres' else signal.SIGTERM)
    try:proc.wait(timeout=25)
    except subprocess.TimeoutExpired:
     cleanup.append({'name':name,'error':'GracefulShutdownTimeout'});os.killpg(proc.pid,signal.SIGKILL);proc.wait(timeout=5)
  except ProcessLookupError:proc.poll()
  except Exception as error:cleanup.append({'name':name,'error':type(error).__name__})
  if name in ['postgres','redis','api']:
   try:preflight.service_exit(name,proc.returncode)
   except AssertionError:cleanup.append({'name':name,'error':'UnexpectedShutdownExit','returncode':proc.returncode})
  if name=='api' and proc.poll() is not None:api_lifetime.stop()
 def stop_api_after_analysis():
  assert http and 'api' not in expected_stopped
  api=next(proc for name,proc,_ in children if name=='api')
  stop_child('api',api)
  assert not cleanup and api.returncode==0,'API did not stop cleanly after its last dependent phase'
  expected_stopped.add('api')
  result['apiStoppedAfterAnalysis']=True;result['apiLifetime']=api_lifetime.evidence()
  status['apiStoppedAt']=time.time();record()
 def interrupted(*_):raise KeyboardInterrupt
 pinned=preflight.accepted_binding(binding,validate_build,a.expected_head)
 analysis_budget(shutil.disk_usage(state.parent).free,next(int(l.split()[1])*1024 for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:')),shutil.disk_usage('/tmp').free)
 os.umask(0o077);state.mkdir(mode=0o700)
 for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]:signal.signal(sig,interrupted)
 try:
  record();resources('before-analysis-supplement',True);(state/'frozen-inputs.json').write_text(json.dumps(pinned,indent=2));result['frozenInputsSha256']=sha_file(state/'frozen-inputs.json')
  before=manifest(source)
  assert {d:manifest(source/d) for d in ['pgdata','uploads','exports']}==json.loads(Path(descriptor['files']['resumedDataManifest']['path']).read_text()),'C23 HTTP03 stopped data differs from final accepted manifest'
  (state/'source-byte-manifest-before.json').write_text(json.dumps(before));result['sourceManifestSha256']=digest(before)
  verify()
  run([node,BASE/'c25-analysis-resume-contract.mjs','--issue-prerequisites',state],'c25-analysis-resume-inherit',timeout=30)
  assert json.loads((state/'c25-analysis-resume-prerequisites.json').read_text())==inherited
  archive['verify_recovery_descriptor'](a.recovery_descriptor,a.expected_recovery_sha256,tools,failed,a.expected_head,check_data=True)
  held=[]
  for name in ['postgres','redis','api']:
   sock=socket.socket();sock.bind(('127.0.0.1',0));held.append(sock);status['ports'][name]=sock.getsockname()[1]
  for sock in held:sock.close()
  dbport,rport,aport=[status['ports'][k] for k in ['postgres','redis','api']]
  for key in ['DATABASE_URL_OWNER','DATABASE_URL','DATABASE_URL_RUNTIME']:
   u=urlparse(runtime[key]);runtime[key]=u._replace(netloc=f'{u.username}:{u.password}@127.0.0.1:{dbport}').geturl()
  runtime.update(PORT=str(aport),REDIS_URL=f'redis://127.0.0.1:{rport}',UPLOAD_DIR=str(failed/'uploads'),EXPORT_DIR=str(failed/'exports'))
  (state/'runtime-private.json').write_text(json.dumps(runtime));result['privateRuntimeFileSha256']=sha_file(state/'runtime-private.json');public={k:v for k,v in runtime.items() if k!='DATABASE_URL_OWNER'}
  postgres=start([pg/'postgres','-D',failed/'pgdata','-h','127.0.0.1','-p',dbport,'-k','','-c','timezone=UTC','-c','shared_buffers=128MB','-c','max_connections=40'],'postgres');ready(dbport,postgres)
  # Retry only the structured startup SQLSTATE; never suppress auth/config errors.
  driver="const {Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL_OWNER,connectionTimeoutMillis:2000});(async()=>{try{await c.connect();await c.query('SELECT 1');process.stdout.write('ready')}catch(e){process.stdout.write(e.code||'UNKNOWN');process.exitCode=e.code==='57P03'?75:1}finally{await c.end()}})()"
  deadline=time.monotonic()+60;polls=[]
  while True:
   probe=subprocess.run([node,'--require',BASE/'loopback-only.cjs','-e',driver],cwd=BACKEND,env={**env,'DATABASE_URL_OWNER':runtime['DATABASE_URL_OWNER']},text=True,capture_output=True,timeout=8);polls.append({'exit':probe.returncode,'result':probe.stdout});(state/'postgres-readiness.json').write_text(json.dumps(polls))
   if probe.returncode==0 and probe.stdout=='ready':break
   assert probe.returncode==75 and probe.stdout=='57P03';guard();assert time.monotonic()<deadline;time.sleep(.2)
  status.update(head=a.expected_head,node='v24.21.0',runtimeFingerprint=pinned['runtimeFingerprint']);record()
  public={k:v for k,v in runtime.items() if k!='DATABASE_URL_OWNER'}
  result['privateRuntimeFileSha256']=sha_file(state/'runtime-private.json')
  audit('baseline','c25-analysis-resume-audit-baseline')
  http=False
  for phase in requested:
   verify();guard();assert phase=='analysis-resume' and not http,'single API lifetime; no restart'
   rp=start([redis,'--bind','127.0.0.1','--port',rport,'--dir',state,'--save','','--appendonly','no','--maxmemory','128mb','--maxmemory-policy','noeviction'],'redis');ready(rport,rp)
   api=start([node,'--require',BASE/'loopback-only.cjs','dist/index.js'],'api',public);api_lifetime.start();ready(aport,api);status['apiUrl']=f'http://127.0.0.1:{aport}'
   for endpoint in ['health','ready']:
    with urllib.request.urlopen(status['apiUrl']+'/'+endpoint,timeout=8) as response:assert response.status==200
   http=True;status['state']='running';record();argv=[node,'--require',BASE/'loopback-only.cjs',BASE/'c25-analysis-resume-execute.mjs',state]
   run(argv,'c25-analysis-resume-execute',public,timeout=PHASE_SECONDS[phase])
   phase_result=state/'c25-analysis-resume-result.json'
   result['phases'][phase]=json.loads(phase_result.read_text());assert result['phases'][phase]['passed'] is True and result['phases'][phase]['phase']==phase
   result['executedPhases'].append(phase)
   result.setdefault('phaseProducers',{})[phase]={'argv':list(map(str,argv)),'inputBindingSha256':result['frozenInputsSha256'],'resultSha256':sha_file(phase_result)}
   stop_api_after_analysis()
   audit('preserve','c25-analysis-resume-audit-preserve');verify();guard();resources('after-'+phase,True)
  result['passed']=set(result['phases'])==set(PHASES)
  result['requestedPrefixPassed']=True
 except BaseException as e:
  result['errorType']=type(e).__name__
  import traceback
  (state/'c25-launcher-error-private.log').write_text(traceback.format_exc())
  raise
 finally:
  # The run deadline must not throw a second asynchronous exception through
  # cleanup and skip PostgreSQL shutdown. Pending alarms are ignored before
  # cancelling the timer; child shutdown retains its independent 25s + 5s bound.
  signal.signal(signal.SIGALRM,signal.SIG_IGN)
  signal.setitimer(signal.ITIMER_REAL,0)
  for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]:signal.signal(sig,signal.SIG_IGN)
  result['finalSnapshotVerified']=False
  if not api_lifetime.stopped and api_lifetime.deadline is not None and time.monotonic()>=api_lifetime.deadline:
   api_lifetime.expired=True
   try:terminate_api_writers()
   except Exception as error:cleanup.append({'name':'api-deadline','error':type(error).__name__});result['passed']=False
  # Quiesce every writer before calling a snapshot final. PostgreSQL remains
  # available solely for the bounded read-only snapshot, then stops last. Stop
  # API first, without leaving its cleanup timer alive through another wait.
  for name,proc,_ in children:
   if name=='api':stop_child(name,proc)
  for name,proc,_ in reversed(children):
   if name not in ['postgres','api']:stop_child(name,proc)
  api_lifetime.stop();result['apiLifetime']=api_lifetime.evidence()
  writers_stopped=all(proc.poll() is not None for name,proc,_ in children if name!='postgres')
  def final_guard():
   resources('final-snapshot')
   assert any(name=='postgres' and proc.poll() is None for name,proc,_ in children),'PostgreSQL exited during final snapshot'
  def final_audit():
   assert writers_stopped and not cleanup,'writers did not stop cleanly'
   assert (state/'c25-analysis-resume-protected-rows-private.json').is_file(),'no complete observed partial full-row inventory'
   evidence=None;failure=None
   try:evidence=audit('final','c25-analysis-resume-audit-final',monitor=final_guard)
   except BaseException as error:failure=error;result['finalDatabaseAuditErrorType']=type(error).__name__
   item=recovery['files']['dataManifest']
   argv=[sys.executable,'-B','-c',MATERIAL_PYTHON,str(node),str(archive_file),item['path'],item['sha256'],str(failed),str(state/'c25-analysis-resume-material-audit-result.json')]
   result['materialAudit']={'argv':list(map(str,argv)),'timeoutSeconds':60,'inlinePythonSha256':__import__('hashlib').sha256(MATERIAL_PYTHON.encode()).hexdigest(),'launcherPython':pinned['launcherPython'],'nodeSha256':sha_file(node)}
   try:
    run(argv,'c25-analysis-resume-material-audit',timeout=60,monitor=final_guard)
    materials=json.loads((state/'c25-analysis-resume-material-audit-result.json').read_text())
    assert materials['passed'] is True and materials['allOldMaterialFilesRetained'] is True
    assert materials['sourceDataManifest']==item
    result['oldMaterialFilesPreserved']=True
    result['materialAudit'].update(resultSha256=sha_file(state/'c25-analysis-resume-material-audit-result.json'),files=materials['files'],bytes=materials['bytes'],directories=materials['directories'])
   except BaseException as error:
    result['oldMaterialFilesPreserved']=False;result['materialAuditErrorType']=type(error).__name__
    if failure is None:failure=error
   if failure is not None:raise failure
   return evidence
  def stop_postgres():
   for name,proc,_ in reversed(children):
    if name=='postgres':stop_child(name,proc)
  preflight.finish_database(final_audit,stop_postgres,result)
  for log in logs:log.close()
  for name,port in status['ports'].items():
   try:
    with socket.create_connection(('127.0.0.1',port),timeout=.2):cleanup.append({'name':name,'error':'PortStillOpen'})
   except OSError:pass
  if (failed/'pgdata/postmaster.pid').exists():cleanup.append({'name':'postgres','error':'PostmasterPidStillPresent'})
  result['cleanupVerified']=not cleanup and all(p.poll() is not None for _,p,_ in children);result['processExits']={n:p.returncode for n,p,_ in children}
  try:
   after=manifest(source);(state/'source-byte-manifest-after.json').write_text(json.dumps(after));result['sourceUnchanged']=before is not None and after==before and not (source/'pgdata/postmaster.pid').exists()
  except Exception:result['sourceUnchanged']=False
  try:result['inputsUnchanged']=pinned is not None and preflight.accepted_binding(binding,validate_build,a.expected_head)==pinned and sha_file(state/'runtime-private.json')==result['privateRuntimeFileSha256'] and sha_file(a.descriptor)==a.expected_descriptor_sha256
  except Exception:result['inputsUnchanged']=False
  try:
   result['failureEvidenceUnchanged']=archive['nondata_manifest'](failed)==failure_nondata
   result['priorContinuationEvidenceUnchanged']=archive['inventory'](prior)==prior_evidence
   result['coreEvidenceUnchanged']=archive['inventory'](core)==core_evidence
   archive['verify_recovery_descriptor'](a.recovery_descriptor,a.expected_recovery_sha256,tools,failed,a.expected_head,check_data=False);result['recoveryArchiveVerified']=True
  except BaseException:result.update(failureEvidenceUnchanged=False,priorContinuationEvidenceUnchanged=False,coreEvidenceUnchanged=False,recoveryArchiveVerified=False)
  isolation=all(result.get(k) is True for k in ['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified','failureEvidenceUnchanged','priorContinuationEvidenceUnchanged','coreEvidenceUnchanged','recoveryArchiveVerified','allPriorRowsPreserved','oldMaterialFilesPreserved']);result['passed']=result['passed'] and analysis_complete(result)
  try:resources('after-cleanup',True)
  except BaseException as error:result.update(passed=False,finalResourceError=type(error).__name__);isolation=False
  status.update(state='stopped',cleanupVerified=result['cleanupVerified'],cleanupErrors=cleanup,endedAt=time.time());record();(state/'c25-analysis-resume-overall-result.json').write_text(json.dumps(result,indent=2));lock.close()
  print(json.dumps({k:result[k] for k in ['passed','cleanupVerified','sourceUnchanged','inputsUnchanged']}),flush=True)
  if not isolation:raise RuntimeError('C25 isolation or cleanup validation failed')
  if not result['passed']:raise RuntimeError('Analysis supplement did not satisfy its complete evidence contract')
if __name__=='__main__':main()
`
export function analysisArgv(argv){
 const i=argv.indexOf('--python');assert.equal(i,0,'absolute --python must be first');const python=argv[1];assert.ok(path.isAbsolute(python));assert.ok(argv.length>2)
 return {python,args:['-B','-c',ANALYSIS_PYTHON,fileURLToPath(new URL('.',import.meta.url)),...argv.slice(2)]}
}
export async function main(argv=process.argv.slice(2)){
 const {python,args}=analysisArgv(argv)
 const child=spawn(python,args,{stdio:'inherit'})
 const forward=signal=>()=>{try{child.kill(signal)}catch{}}
 const handlers=Object.fromEntries(['SIGINT','SIGTERM','SIGHUP'].map(s=>[s,forward(s)]))
 for(const [s,h]of Object.entries(handlers))process.on(s,h)
 try{return await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(code??(signal?1:0)))})}
 finally{for(const [s,h]of Object.entries(handlers))process.off(s,h)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)process.exitCode=await main()
