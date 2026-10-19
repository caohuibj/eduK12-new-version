/** Explicit C25 continuation. Archive and runtime each require separate GO.
 * Existing Python, products and producers are immutable. Importing is inert. */
import {spawn} from 'node:child_process'
import {fileURLToPath,pathToFileURL} from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
export const CONTINUATION_PYTHON=String.raw`#!/usr/bin/env python3
"""Explicit C25 continuation; existing upgrade/A are inherited, never rerun.
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
PHASES=['continuation-prepare','scheduled','guards','consumers','restore']
PHASE_SECONDS={'continuation-prepare':300,'scheduled':600,'guards':300,'consumers':300,'restore':600}
FAILED_RECEIPT_SHA='8f7f0697582519c4032a1726e71fb2bd3879c7f81afea54e36d76d6c07c50eff'
FAILED_SNAPSHOT_SHA='4ab9189d33c04e7aae7cd1b80d6e390246672eaa9841b5dac887bbbb1fbcc3b1'
def continuation_budget(free,memory,tmp_free):
 assert free>=FLOOR+preflight.RESERVE,'continuation needs unchanged 8GiB + 512MiB admission reserve'
 assert memory>=preflight.MEMORY and tmp_free>=preflight.RESERVE,'memory/tmp archive retention floor'
 return {'freeBytes':free,'cloneBytes':0,'reserveBytes':preflight.RESERVE,'projectedFreeAfterReserve':free-preflight.RESERVE,'memAvailableBytes':memory,'tmpFreeBytes':tmp_free}
def continuation_destination(value,root):
 state=Path(os.path.abspath(value));root=Path(root)
 assert state.parent==root and re.fullmatch('eduk12_c25_continuation_[0-9]{2}',state.name) and not state.exists()
 assert all(not part.is_symlink() for part in [state,*state.parents]),'continuation destination alias'
 return state
def inherited_phases(failure,receipts,hashes):
 assert failure['passed'] is False and set(failure['phases'])=={'upgrade','prepare'}
 assert all(failure.get(k) is True for k in ['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified'])
 assert failure['finalSnapshotSha256']==FAILED_SNAPSHOT_SHA and failure['processExits']['c25-scheduled']==1
 assert set(receipts)==set(hashes)=={'upgrade','prepare'}
 for phase,value in receipts.items():
  assert value['passed'] is True and value==failure['phases'][phase]
  assert failure['phaseProducers'][phase]['resultSha256']==hashes[phase]
 return {phase:{'resultSha256':hashes[phase],'sourceRuntimeReceiptSha256':FAILED_RECEIPT_SHA,'execution':'INHERITED_NOT_REEXECUTED'} for phase in receipts}
def continuation_complete(result):
 return (set(result.get('phases',{}))==set(PHASES)
  and result.get('executedPhases')==PHASES
  and set(result.get('inheritedPhases',{}))=={'upgrade','prepare'}
  and all(result['phases'][p].get('passed') is True for p in PHASES)
  and all(result.get(k) is True for k in ['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified','apiStoppedAfterScheduled','failureEvidenceUnchanged','recoveryArchiveVerified','failedRowsPreserved'])
  and result.get('apiLifetime',{}).get('stopped') is True and result['apiLifetime'].get('expired') is False)


def main():
 os.umask(0o077)
 p=argparse.ArgumentParser(description=__doc__)
 for name in ['tools','descriptor','state','backend-receipt','frontend-receipt','failure-state','recovery-descriptor']:p.add_argument('--'+name,type=Path,required=True)
 for name in ['expected-descriptor-sha256','expected-head','expected-backend-receipt-sha256','expected-frontend-receipt-sha256','expected-recovery-sha256']:p.add_argument('--'+name,required=True)
 a=p.parse_args()
 assert re.fullmatch('[0-9a-f]{40}',a.expected_head)
 tools=a.tools.resolve();failed=a.failure_state.resolve();state=continuation_destination(a.state,REPO.parent);requested=list(PHASES)
 assert failed==REPO.parent/'eduk12_c25_http_01','only this reviewed failed cluster may continue'
 source_contract.destination_path(state,protected=[failed,tools,a.recovery_descriptor.parent,a.descriptor.parent,REPO.parent/'eduk12_c21_http_01'])
 lock=(tools/'.measurement.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 node=tools/'node_modules/node/bin/node';pg=tools/'postgresql/bin';redis=tools/'redis/bin/redis-server'
 assert subprocess.check_output([node,'--version'],text=True,timeout=10).strip()=='v24.21.0'
 assert '16.15' in subprocess.check_output([pg/'postgres','--version'],text=True,timeout=10)
 assert 'v=7.4.11 ' in subprocess.check_output([redis,'--version'],text=True,timeout=10)
 descriptor=source_contract.validate_descriptor(a.descriptor,a.expected_descriptor_sha256,pg/'pg_controldata',destination=state)
 source=Path(descriptor['dataRoot']);evidence=Path(descriptor['evidenceRoot'])
 archive_file=BASE/'c25-continuation-archive.mjs'
 archive_code=subprocess.check_output([node,'--input-type=module','-e',"import {ARCHIVE_PYTHON} from "+json.dumps(archive_file.as_uri())+";process.stdout.write(ARCHIVE_PYTHON)"],text=True,timeout=10)
 archive={'__name__':'c25_continuation_archive_library'};exec(compile(archive_code,str(archive_file),'exec'),archive)
 recovery=archive['verify_recovery_descriptor'](a.recovery_descriptor,a.expected_recovery_sha256,tools,failed,a.expected_head,check_data=True)
 assert sha_file(failed/'c25-runtime-result.json')==FAILED_RECEIPT_SHA
 assert sha_file(failed/'c25-final-db-snapshot.json')==FAILED_SNAPSHOT_SHA
 failure=json.loads((failed/'c25-runtime-result.json').read_text())
 inherited=inherited_phases(failure,{p:json.loads((failed/f'c25-{p}-result.json').read_text()) for p in ['upgrade','prepare']},{p:sha_file(failed/f'c25-{p}-result.json') for p in ['upgrade','prepare']})
 failure_nondata=archive['nondata_manifest'](failed)
 assert REPO not in state.parents
 def validate_build():
  backend=preflight.validate_build(a.backend_receipt,a.expected_backend_receipt_sha256,'backend',a.expected_head,node)
  frontend=preflight.validate_build(a.frontend_receipt,a.expected_frontend_receipt_sha256,'frontend',a.expected_head,node)
  assert backend['prismaClientReceipt']==frontend['prismaClientReceipt'],'two producers must consume identical client verification'
  return backend,frontend
 backend_build,frontend_build=validate_build()
 memory=next(int(l.split()[1])*1024 for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:'))
 copybytes=0
 budget=continuation_budget(shutil.disk_usage(state.parent).free,memory,shutil.disk_usage('/tmp').free)
 runtime=json.loads((failed/'runtime-private.json').read_text())
 for key,role in [('DATABASE_URL_OWNER','eduk12_owner'),('DATABASE_URL','eduk12_runtime'),('DATABASE_URL_RUNTIME','eduk12_runtime')]:
  u=urlparse(runtime[key]);assert u.hostname=='127.0.0.1' and u.username==role and u.path=='/eduk12_recovery'
 runtime.update(PUBLIC_ASSESSMENT_IP_GET_LIMIT='10000',PUBLIC_ASSESSMENT_IP_FINAL_LIMIT='10000',PUBLIC_ASSESSMENT_TOKEN_GET_LIMIT='10000',PUBLIC_ASSESSMENT_TOKEN_FINAL_LIMIT='10000',PUBLIC_ASSESSMENT_RECOVERY_GET_LIMIT='10000',PUBLIC_ASSESSMENT_RECOVERY_FINAL_LIMIT='10000',BACKGROUND_WORKERS_ENABLED='false',HEAVY_PROCESSING_ENABLED='false',VIDEO_PROCESSING_ENABLED='false',ASSESSMENT_REPORT_ASYNC_ENABLED='true',ASSESSMENT_WHOLE_SUBMIT_ENABLED='true',PERF_ISOLATED_TEST_MODE='1',PERF_SQL_EVENT_COUNT='1')
 effective={**runtime,'PORT':'0','REDIS_URL':'redis://127.0.0.1:0','UPLOAD_DIR':str(failed/'uploads'),'EXPORT_DIR':str(failed/'exports')}
 for key in ['DATABASE_URL_OWNER','DATABASE_URL','DATABASE_URL_RUNTIME']:
  u=urlparse(effective[key]);effective[key]=u._replace(netloc=f'{u.username}:{u.password}@127.0.0.1:0').geturl()
 env={'PATH':f'{node.parent}:{pg}:/usr/bin:/bin','HOME':str(state),'TMPDIR':str(state),'LANG':'C.UTF-8','TZ':'UTC','NODE_ENV':'test','PYTHONDONTWRITEBYTECODE':'1'}
 result={'passed':False,'scope':'C25_EXPLICIT_CONTINUATION_INHERITED_UPGRADE_A_NOT_A_FRESH_RUN_OR_CAPACITY','failureSource':str(failed),'failureReceiptSha256':FAILED_RECEIPT_SHA,'failureSnapshotSha256':FAILED_SNAPSHOT_SHA,'inheritedPhases':inherited,'executedPhases':[],'recoveryDescriptorSha256':a.expected_recovery_sha256,'phases':{},'sourceReceiptSha256':source_contract.RECEIPT_SHA256,'sourceSnapshotSha256':source_contract.SNAPSHOT_SHA256,'descriptorSha256':a.expected_descriptor_sha256,'cloneBytes':copybytes,'budget':budget,'backendBuildReceiptSha256':a.expected_backend_receipt_sha256,'frontendBuildReceiptSha256':a.expected_frontend_receipt_sha256,'notCovered':['C19 missing-only analysis/CSV and selected-video supplement','native IndexedDB and C24 browser acceptance','CPU/throughput/capacity']}
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
  refs={str(a.backend_receipt):sha_file(a.backend_receipt),str(a.frontend_receipt):sha_file(a.frontend_receipt),str(a.descriptor):sha_file(a.descriptor),str(a.recovery_descriptor):sha_file(a.recovery_descriptor),str(failed/'c25-runtime-result.json'):sha_file(failed/'c25-runtime-result.json'),str(failed/'c25-final-db-snapshot.json'):sha_file(failed/'c25-final-db-snapshot.json')}
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
  argv=[node,BASE/'c25-continuation-db.mjs','--python',sys.executable,'--db-helper',BASE/'c25-db.py','--tools',tools,'--state',state,'--failure-state',failed,'--expected-failed-snapshot-sha256',FAILED_SNAPSHOT_SHA,'--mode',mode,'--label',label]
  run(argv,label,timeout=600 if mode=='restore' else 300,monitor=monitor)
  evidence=json.loads((state/(label+'-result.json')).read_text())
  assert evidence['passed'] is True and evidence['mode']==mode
  assert evidence['continuationRetainedFacts']['allFailedRowsRetained'] is True
  if mode=='final':
   assert sha_file(state/'c25-continuation-final-db-snapshot.json')==evidence['snapshotSha256']
   result['failedRowsPreserved']=True
  result.setdefault('auditProducers',{})[label]={'argv':list(map(str,argv)),'timeoutSeconds':600 if mode=='restore' else 300,'resultSha256':sha_file(state/(label+'-result.json'))}
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
 def stop_api_after_scheduled():
  assert http and 'api' not in expected_stopped
  api=next(proc for name,proc,_ in children if name=='api')
  stop_child('api',api)
  assert not cleanup and api.returncode==0,'API did not stop cleanly after its last dependent phase'
  expected_stopped.add('api')
  result['apiStoppedAfterScheduled']=True;result['apiLifetime']=api_lifetime.evidence()
  status['apiStoppedAt']=time.time();record()
 def interrupted(*_):raise KeyboardInterrupt
 pinned=preflight.accepted_binding(binding,validate_build,a.expected_head)
 continuation_budget(shutil.disk_usage(state.parent).free,next(int(l.split()[1])*1024 for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:')),shutil.disk_usage('/tmp').free)
 os.umask(0o077);state.mkdir(mode=0o700)
 for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]:signal.signal(sig,interrupted)
 try:
  record();resources('before-continuation',True);(state/'frozen-inputs.json').write_text(json.dumps(pinned,indent=2));result['frozenInputsSha256']=sha_file(state/'frozen-inputs.json')
  before=manifest(source)
  assert {d:manifest(source/d) for d in ['pgdata','uploads','exports']}==json.loads(Path(descriptor['files']['resumedDataManifest']['path']).read_text()),'C23 HTTP03 stopped data differs from final accepted manifest'
  (state/'source-byte-manifest-before.json').write_text(json.dumps(before));result['sourceManifestSha256']=digest(before)
  verify()
  for name in ['fixture-private.json','c25-original-rows-private.json','c25-prepare-result.json']:
   shutil.copy2(failed/name,state/name);assert sha_file(failed/name)==sha_file(state/name)
  shutil.copy2(failed/'c25-fixture-private.json',state/'c25-inherited-fixture-private.json')
  assert sha_file(failed/'c25-fixture-private.json')==sha_file(state/'c25-inherited-fixture-private.json')
  (state/'c25-inherited-prerequisites.json').write_text(json.dumps(inherited,indent=2))
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
  audit('baseline','c25-continuation-audit-baseline')
  http=False
  for phase in requested:
   verify();guard()
   if phase=='restore':
    status['state']='restoring';record()
    audit('restore','c25-continuation-restore')
    argv=result['auditProducers']['c25-continuation-restore']['argv']
   else:
    if not http:
     rp=start([redis,'--bind','127.0.0.1','--port',rport,'--dir',state,'--save','','--appendonly','no','--maxmemory','128mb','--maxmemory-policy','noeviction'],'redis');ready(rport,rp)
     api=start([node,'--require',BASE/'loopback-only.cjs','dist/index.js'],'api',public);api_lifetime.start();ready(aport,api);status['apiUrl']=f'http://127.0.0.1:{aport}'
     for endpoint in ['health','ready']:
      with urllib.request.urlopen(status['apiUrl']+'/'+endpoint,timeout=8) as response:assert response.status==200
     http=True
    status['state']='running';record();argv=[node,'--require',BASE/'loopback-only.cjs',BASE/f'c25-{phase}.mjs',state];
    if phase=='consumers':argv+=['--mode','finalize']
    run(argv,'c25-'+phase,public,timeout=PHASE_SECONDS[phase])
   phase_result=state/('c25-continuation-restore-result.json' if phase=='restore' else f'c25-{phase}-result.json')
   result['phases'][phase]=json.loads(phase_result.read_text());assert result['phases'][phase]['passed'] is True
   result['executedPhases'].append(phase)
   result.setdefault('phaseProducers',{})[phase]={'argv':list(map(str,argv)),'inputBindingSha256':result['frozenInputsSha256'],'resultSha256':sha_file(phase_result)}
   if phase=='scheduled':stop_api_after_scheduled()
   audit('preserve','c25-continuation-audit-preserve-'+phase);verify();guard();resources('after-'+phase,True)
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
   assert (state/'c25-original-rows-private.json').is_file(),'no completed original-row inventory'
   return audit('final','c25-continuation-audit-final',monitor=final_guard)
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
   archive['verify_recovery_descriptor'](a.recovery_descriptor,a.expected_recovery_sha256,tools,failed,a.expected_head,check_data=False);result['recoveryArchiveVerified']=True
  except BaseException:result.update(failureEvidenceUnchanged=False,recoveryArchiveVerified=False)
  isolation=all(result.get(k) is True for k in ['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified','failureEvidenceUnchanged','recoveryArchiveVerified','failedRowsPreserved']);result['passed']=result['passed'] and continuation_complete(result)
  try:resources('after-cleanup',True)
  except BaseException as error:result.update(passed=False,finalResourceError=type(error).__name__);isolation=False
  status.update(state='stopped',cleanupVerified=result['cleanupVerified'],cleanupErrors=cleanup,endedAt=time.time());record();(state/'c25-continuation-result.json').write_text(json.dumps(result,indent=2));lock.close()
  print(json.dumps({k:result[k] for k in ['passed','cleanupVerified','sourceUnchanged','inputsUnchanged']}),flush=True)
  if not isolation:raise RuntimeError('C25 isolation or cleanup validation failed')
if __name__=='__main__':main()
`
export function continuationArgv(argv){
 const i=argv.indexOf('--python');assert.equal(i,0,'absolute --python must be first');const python=argv[1];assert.ok(path.isAbsolute(python));assert.ok(argv.length>2)
 return {python,args:['-B','-c',CONTINUATION_PYTHON,fileURLToPath(new URL('.',import.meta.url)),...argv.slice(2)]}
}
export async function main(argv=process.argv.slice(2)){
 const {python,args}=continuationArgv(argv)
 const child=spawn(python,args,{stdio:'inherit'})
 const forward=signal=>()=>{try{child.kill(signal)}catch{}}
 const handlers=Object.fromEntries(['SIGINT','SIGTERM','SIGHUP'].map(s=>[s,forward(s)]))
 for(const [s,h]of Object.entries(handlers))process.on(s,h)
 try{return await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(code??(signal?1:0)))})}
 finally{for(const [s,h]of Object.entries(handlers))process.off(s,h)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)process.exitCode=await main()
