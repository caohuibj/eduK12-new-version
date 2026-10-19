/** Thin analysis-only outer controller. Reviewed ownership/cleanup definitions
 * are imported byte-for-byte; the workload/inputs/current DB contracts are new.
 * Independent supervisor owns the lock and absolute 1200s across both processes. */
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {RUN_PYTHON as oldRun} from './c25-c26-run.mjs'
import {MATERIAL_PYTHON as oldMaterials} from './c25-analysis-resume.mjs'
export const MATERIAL_PROGRAM=oldMaterials.replaceAll('ARCHIVE_PYTHON','pythonProgram').replaceAll('eduk12_c25_analysis_02/c25-analysis-resume-material-audit-result.json','eduk12_c26_analysis_abba_01/c25-c26-material-audit-result.json')
export const RUN_PYTHON=String.raw`
import argparse,ast,ctypes,errno,fcntl,hashlib,importlib.util,json,os,re,shutil,signal,socket,stat,subprocess,sys,threading,time,traceback
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse
sys.dont_write_bytecode=True
BASE=Path('/workspace/scratch/5a77e8bdc1ae/eduk12_c22_20261019/server-version/scripts/recovery')
SHARED_SOURCE=${JSON.stringify(oldRun)}
MATERIAL_PROGRAM=${JSON.stringify(MATERIAL_PROGRAM)}
SHARED_NAMES={'module','private_json','private_read','update_json','resource_snapshot','assert_resources','resources','Deadline','enable_subreaper','proc','proc_disappeared','proc_absent','ProcessTable','process_table','OwnedGroups','spawn_registered','stop_failed_command','reclaim_owned','assert_baseline_unchanged','audit_baseline_with_status','persist_final','finish_watchdog'}
nodes=[n for n in ast.parse(SHARED_SOURCE).body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in SHARED_NAMES]
assert {n.name for n in nodes}==SHARED_NAMES
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<unchanged-owned-deadline-helpers>','exec'),globals())
preflight=module('analysis_contracts','c25-contracts.py');source_contract=module('analysis_source','c25-source.py')
ROOT,REPO,BACKEND,FRONTEND=preflight.REPO.parent,preflight.REPO,preflight.BACKEND,preflight.FRONTEND
STATE=ROOT/'eduk12_c26_analysis_abba_01';LAUNCH=ROOT/'c25-build-evidence/c26-analysis-abba-launch-01';DATA=ROOT/'eduk12_c25_http_01';CORE=ROOT/'eduk12_c25_continuation_02'
TOOLS=ROOT/'eduk12_tools_20261018';NODE=TOOLS/'node_modules/node/bin/node'
sha_file,digest=preflight.sha_file,preflight.digest
TOTAL,FINAL_AUDIT,MATERIAL,FINAL_STOP_VERIFY,DRIVER_CLEANUP=1200,300,60,60,60
ARCHIVE_HEAD='394731e684dcaa99070b609f052d16c849aa3204'
RECOVERY=ROOT/'c25-build-evidence/c26-analysis-recovery-01/recovery-descriptor.json';RECOVERY_SHA='b2d78a9adaa3b24ccbfd035a9cc6a0cb322368474d041c6bbc42e55a497e0756'
SEED=ROOT/'eduk12_c25_continuation_02/c25-fixture-private.json';SEED_SHA='e1015179f1c4494c3448000b9c62fb0d18ab82a382c43a43ebb29d0bc7fc4e28'

def deadline_from(started):
 b=Deadline();assert type(started)is int and started<=b.started and (b.started-started)<1200*10**9
 b.started=started;b.overall=started+1200*10**9;b.driver=started+780*10**9;b.work=started+720*10**9
 return b

def archive_library(node):
 p=BASE/'c25-c26-analysis-archive.mjs';code=subprocess.check_output([node,'--input-type=module','-e','import{pythonProgram}from '+json.dumps(p.as_uri())+';process.stdout.write(pythonProgram)'],text=True,timeout=10)
 value={'__name__':'analysis_recovery_consumer'};exec(compile(code,str(p),'exec'),value);return value,hashlib.sha256(code.encode()).hexdigest()

def artifact_binding(node):
 p=BASE/'c25-c26-analysis-artifacts.cjs';code='const a=require('+json.dumps(str(p))+');process.stdout.write(JSON.stringify(["A","B"].map(arm=>{const s=a.selectAnalysisArtifact(arm,{full:true});return {arm,input:s.inputIdentity,resolution:a.analysisResolutionProof(s)}})))'
 return json.loads(subprocess.check_output([node,'-e',code],cwd=BACKEND,text=True,timeout=30,env={'PATH':str(node.parent)+':/usr/bin:/bin','NODE_PATH':str(BACKEND/'node_modules'),'NODE_DISABLE_COMPILE_CACHE':'1'}))

def collect_binding(a,effective,archive_sha):
 assert not preflight.git('status','--porcelain') and preflight.git('rev-parse','HEAD').decode().strip()==a.expected_head
 assert sha_file(SEED)==SEED_SHA
 return {'head':a.expected_head,'source':preflight.source_inventory(),'backendInputs':preflight.component_inputs(BACKEND),'frontendInputs':preflight.component_inputs(FRONTEND),'backendDependencies':preflight.dependency_inventory(BACKEND),'frontendDependencies':preflight.dependency_inventory(FRONTEND),'generatedClient':preflight.file_inventory(BACKEND,'node_modules/.prisma/client'),'AFrontend':preflight.file_inventory(FRONTEND,'dist'),'ABArtifacts':artifact_binding(a.tools/'node_modules/node/bin/node'),'runtimeConfigurationSha256':digest(effective),'archiveInlineSha256':archive_sha,'inlineSha256':hashlib.sha256(PROGRAM_SOURCE.encode()).hexdigest(),'seedSha256':SEED_SHA,'python':{'path':sys.executable,'realpath':str(Path(sys.executable).resolve()),'sha256':sha_file(Path(sys.executable).resolve())}}

def final_input_verification(a,archive,archive_sha):
 before=private_read(STATE/'c25-c26-frozen-inputs.json');effective=private_read(STATE/'c25-c26-effective-runtime-private.json');assert collect_binding(a,effective,archive_sha)==before
 archive['verify_recovery_descriptor'](a.recovery_descriptor,a.expected_recovery_sha256,a.tools,ARCHIVE_HEAD,check_data=False)
 pins=private_read(STATE/'c25-c26-input-bindings-private.json');assert sha_file(STATE/'c25-c26-frozen-inputs.json')==pins['frozenInputsSha256']
 assert sha_file(STATE/'runtime-private.json')==pins['runtimeSha256'] and sha_file(STATE/'c25-c26-effective-runtime-private.json')==pins['effectiveRuntimeSha256']
 private_json(STATE/'c25-c26-input-verification-result.json',{'passed':True,'sourceUnchanged':True,'inputsUnchanged':True,'recoveryEvidenceUnchanged':True})

def admitted_baseline_bindings(state,value):
 assert value['passed'] is True and value['mode']=='baseline' and value['scope']=='ANALYSIS_ONLY_EXACT_CURRENT_6708_6719';validate_final_facts(value)
 return {str(p):sha_file(p) for p in [state/'c25-c26-audit-baseline-result.json',state/'c25-c26-protected-rows-private.json',state/'c25-c26-audit-baseline-db-snapshot.json']}

def validate_final_facts(value):
 facts=value['protectedCoreFacts'];assert facts=={'allRowsExact':True,'allColumnsExact':True,'liveSchemaExact':True,'tables':217,'workingRows':6719,'workingCheckpoints':22,'noAddedOrRemovedRows':True,'restoreNormalizationApplied':False,'primarySnapshotExact':True,'primaryRows':6708}
 return facts

def validate_final(value):
 assert value['passed'] is True and value['mode']=='final' and value['scope']=='ANALYSIS_ONLY_EXACT_CURRENT_6708_6719';return validate_final_facts(value)

def validate_driver(value,journal,journal_file):
 assert value['passed'] is True and value['workloadComplete'] is True and value['scope']=='ANALYSIS_ONLY_ABBA' and value['newFixtureOrFinals']==0 and value['automaticRetries']==0
 assert journal['passed'] is True and journal['bytes']==journal_file.stat().st_size and journal['sha256']==sha_file(journal_file)
 experiment=value['experiment'];assert experiment['workloadComplete'] is True and experiment['overallPassed'] is False and experiment['oracle']['responses']==60 and experiment['oracle']['completeFieldsEqual'] is True
 assert [r['arm'] for r in experiment['blocks']]==['A','B','B','A']
 for b in experiment['blocks']:
  assert len(b['warmup'])==3 and len(b['serial'])==10 and len(b['pair'])==1
  c=b['closed'];assert c['passed'] is True and c['closeObserved'] is True and c['groupQuiescent'] is True and c['exit']=={'code':0,'signal':None} and c['observer']['passed'] is True
 assert len({(b['closed']['identity']['pid'],b['closed']['identity']['startTicks']) for b in experiment['blocks']})==4
 coverage=value['metricCoverage'];assert coverage['contract']=='C26_CLUSTER_TOTALS_V1' and coverage['performanceQualification']=='NOT_IMPLIED_BY_WORKLOAD_COMPLETION' and coverage['workers']==[]
 assert len(value['windows'])==60 and all(x['passed'] is True and x['operationComplete'] is True for x in value['windows'])
 assert len([x for x in value['windows'] if x['operation']['phase']=='formal'])==44
 for w in value['windows']:
  pg=w['pgSettled']['metricCoverage'];assert pg['completePgCpuOrGainComparison'] is False and pg['pgConnectionRoles']=='NOT_OBSERVED_BY_DESIGN'
  if pg['pgCluster']['status']!='SAMPLED_LOWER_BOUND' or pg['activityIsolation']['status']=='CONTAMINATED':assert pg['comparisonEligible'] is False
 assert all(x['passed'] is True for x in value['cleanup'])
 return {'fixedABBAWorkloadVerified':True,'formalSerialPerArm':20,'formalPairsPerArm':2,'responses':60,'journalSha256':journal['sha256']}

def parse_args():
 p=argparse.ArgumentParser();p.add_argument('--expected-head',required=True);p.add_argument('--started',type=int,required=True);p.add_argument('--supervisor-pid',type=int,required=True);p.add_argument('--controller',action='store_true');a=p.parse_args()
 assert a.controller and re.fullmatch('[a-f0-9]{40}',a.expected_head) and a.supervisor_pid==os.getppid()
 a.tools=TOOLS;a.state=STATE;a.descriptor=RECOVERY;a.recovery_descriptor=RECOVERY;a.expected_recovery_sha256=RECOVERY_SHA;a.verify_only=False
 return a

def main():
 os.umask(0o077);a=parse_args();budget=deadline_from(a.started);node=a.tools/'node_modules/node/bin/node';pg=a.tools/'postgresql/bin';redis=a.tools/'redis/bin/redis-server'
 if a.verify_only:
  assert STATE.is_dir();archive,archive_sha=archive_library(node);final_input_verification(a,archive,archive_sha);return
 assert not os.path.lexists(STATE);source_contract.destination_path(STATE,protected=[DATA,CORE,REPO,a.tools,a.descriptor.parent,a.recovery_descriptor.parent,SEED.parent])
 assert os.getppid()==a.supervisor_pid;entry=resources(True)
 STATE.mkdir(mode=0o700);result={'schemaVersion':1,'scope':'C26_ANALYSIS_ONLY_ABBA_SYNTHETIC_MEASUREMENT','workloadComplete':False,'performanceQualification':'NOT_IMPLIED_BY_OVERALL_PASS','passed':False,'entryResources':entry,'minimumResources':dict(entry),'deadline':budget.invocation(),'newDatabaseRestoreExecuted':False,'automaticB':False,'processes':[],'audits':{},'finalSnapshotVerified':False,'outerObserverCost':{'samples':0,'threadCpuNs':0,'wallNs':0,'scope':'LAUNCHER_WATCHDOG_RESOURCES_AND_FULL_PROC_DESCENDANT_SCANS; NOT_BUSINESS_CPU'}};status={'state':'preflight','pids':{},'ports':{},'startedAt':time.time()}
 owned=OwnedGroups(pg/'postgres');root_identity=proc(os.getpid());children=[];logs=[];errors=[];failure=[];done=threading.Event();driver_identity=None;pinned=None;frozen_sha=None;baseline_bindings=None;archive=None;recovery=None;cleaning=False;supervising=False
 def record_status():update_json(STATE/'status.json',status)
 def sample():
  value=resource_snapshot()
  for k,v in value.items():result['minimumResources'][k]=min(result['minimumResources'][k],v)
  result['lastResources']=value;return assert_resources(value)
 def sync_owned():
  if not supervising:return
  owned.capture_descendants(root_identity)
  if driver_identity:
   owned.import_registry(STATE/'c25-c26-owned-processes-private.json',driver_identity)
 def monitor():
  while not done.wait(.05):
   cost_at=time.monotonic_ns();cpu_at=time.thread_time_ns()
   try:
    sync_owned();sample()
    if budget.clock()>=budget.overall:raise TimeoutError('1200s hard outer deadline')
    if driver_identity and budget.clock()>=budget.driver and any(name=='driver' and p.poll() is None for name,p in children):raise TimeoutError('driver cleanup deadline; final audit reserve retained')
   except BaseException as e:
    if not failure:failure.append(e)
    try:owned.signal(signal.SIGKILL,include_postgres=budget.clock()>=budget.overall)
    except BaseException as cleanup:errors.append({'stage':'watchdog','errorType':type(cleanup).__name__})
   finally:
    cost=result['outerObserverCost'];cost['samples']+=1;cost['threadCpuNs']+=time.thread_time_ns()-cpu_at;cost['wallNs']+=time.monotonic_ns()-cost_at
 def guard(end=None):
  sample();budget.remaining(end);sync_owned()
  if failure and not cleaning:raise failure[0]
  if not cleaning:
   for name,p in children:
    if name in ['postgres','redis']:assert p.poll() is None,'required service exited: '+name
 def interrupted(signum,frame):raise TimeoutError('outer signal '+str(signum))
 previous={s:signal.signal(s,interrupted) for s in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP,signal.SIGALRM]};signal.setitimer(signal.ITIMER_REAL,budget.remaining())
 watcher=threading.Thread(target=monitor,daemon=True);watcher.start()
 env={'PATH':f'{node.parent}:{pg}:/usr/bin:/bin','HOME':str(STATE),'TMPDIR':str(STATE),'LANG':'C.UTF-8','TZ':'UTC','NODE_ENV':'test','PYTHONDONTWRITEBYTECODE':'1','NODE_DISABLE_COMPILE_CACHE':'1','NODE_PATH':str(BACKEND/'node_modules')}
 def start(argv,name,extra=None):
  guard();log=(STATE/(name+'.log')).open('x');logs.append(log);p,identity=spawn_registered(owned,children,name,list(map(str,argv)),cwd=BACKEND,env={**env,**(extra or {})},stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
  result['processes'].append({'name':name,'argv':list(map(str,argv)),'identity':identity});return p,identity
 def run(argv,name,seconds,end=None,extra=None,allowed_exits=(0,)):
  allowed=min(seconds,budget.remaining(end));cutoff=min(budget.overall if end is None else end,budget.clock()+int(allowed*10**9));p,identity=start(argv,name,extra)
  try:
   while p.poll() is None:guard(cutoff);time.sleep(.05)
   guard(cutoff);assert p.returncode in allowed_exits,name+' failed'
  except BaseException:
   try:stop_failed_command(owned,p,identity,name,budget.overall)
   except BaseException as cleanup:errors.append({'stage':'failed-command-stop:'+name,'errorType':type(cleanup).__name__})
   raise
  finally:private_json(STATE/(name+'-process-result.json'),{'exitCode':p.poll(),'argv':list(map(str,argv)),'deadlineMonotonicNs':str(cutoff),'finishedMonotonicNs':str(budget.clock())})
  return p
 def ready(port,p):
  end=min(budget.work,budget.clock()+60*10**9)
  while True:
   guard(end);assert p.poll() is None
   try:
    with socket.create_connection(('127.0.0.1',port),timeout=.2):return
   except OSError:time.sleep(.1)
 def audit(mode,end):
  if mode=='final':
   assert_baseline_unchanged(baseline_bindings)
  label='c25-c26-audit-'+mode;argv=[node,BASE/'c25-c26-analysis-db.mjs','--python',sys.executable,'--tools',a.tools,'--state',STATE,'--mode',mode]
  run(argv,label,300,end);file=STATE/(label+'-result.json');value=private_read(file);assert value['passed'] is True and value['mode']==mode
  result['audits'][mode]={'resultSha256':sha_file(file),'argv':list(map(str,argv))};return value
 def stop_all(include_postgres):
  # Finite cleanup is inside the original total; even an expired observation
  # still attempts signals/reaping and keeps its overall result false.
  report=reclaim_owned(owned,root_identity,children,budget.overall,include_postgres)
  result.setdefault('stopProofs',[]).append(report);errors.extend(report['errors'])
  assert report['passed'],'owned processes did not close within original deadline'

 try:
  record_status();result['subreaper']=enable_subreaper();assert subprocess.check_output([node,'--version'],text=True,timeout=10).strip()=='v24.21.0';assert '16.15' in subprocess.check_output([pg/'postgres','--version'],text=True,timeout=10);assert 'v=7.4.11 ' in subprocess.check_output([redis,'--version'],text=True,timeout=10)
  archive,archive_sha=archive_library(node)
  recovery=archive['verify_recovery_descriptor'](a.recovery_descriptor,a.expected_recovery_sha256,a.tools,ARCHIVE_HEAD,check_data=True)
  held=[]
  for name in ['postgres','redis','api']:
   sock=socket.socket();sock.bind(('127.0.0.1',0));held.append(sock);status['ports'][name]=sock.getsockname()[1]
  runtime=private_read(CORE/'runtime-private.json')
  for key,role in [('DATABASE_URL_OWNER','eduk12_owner'),('DATABASE_URL','eduk12_runtime'),('DATABASE_URL_RUNTIME','eduk12_runtime')]:
   u=urlparse(runtime[key]);assert u.hostname=='127.0.0.1' and u.username==role and u.path=='/eduk12_recovery';runtime[key]=u._replace(netloc=f'{u.username}:{u.password}@127.0.0.1:{status["ports"]["postgres"]}').geturl()
  runtime.update(PORT=str(status['ports']['api']),REDIS_URL=f'redis://127.0.0.1:{status["ports"]["redis"]}',UPLOAD_DIR=str(DATA/'uploads'),EXPORT_DIR=str(DATA/'exports'),BACKGROUND_WORKERS_ENABLED='false',HEAVY_PROCESSING_ENABLED='false',VIDEO_PROCESSING_ENABLED='false',ASSESSMENT_REPORT_ASYNC_ENABLED='true',ASSESSMENT_WHOLE_SUBMIT_ENABLED='true',PERF_ISOLATED_TEST_MODE='1',PERF_SQL_EVENT_COUNT='1')
  effective={k:v for k,v in runtime.items() if k!='DATABASE_URL_OWNER'}
  for key in ['DATABASE_URL','DATABASE_URL_RUNTIME']:effective[key]=urlparse(effective[key])._replace(path='/eduk12_c25_joint_restore').geturl()
  private_json(STATE/'runtime-private.json',runtime);private_json(STATE/'c25-c26-effective-runtime-private.json',effective)
  pinned=collect_binding(a,effective,archive_sha)
  private_json(STATE/'c25-c26-frozen-inputs.json',pinned);frozen_sha=sha_file(STATE/'c25-c26-frozen-inputs.json');private_json(STATE/'c25-c26-input-bindings-private.json',{'frozenInputsSha256':sha_file(STATE/'c25-c26-frozen-inputs.json'),'runtimeSha256':sha_file(STATE/'runtime-private.json'),'effectiveRuntimeSha256':sha_file(STATE/'c25-c26-effective-runtime-private.json')})
  resources(True);guard(budget.work)
  for sock in held:sock.close()
  supervising=True
  postgres,pg_identity=start([pg/'postgres','-D',DATA/'pgdata','-h','127.0.0.1','-p',status['ports']['postgres'],'-k','','-c','timezone=UTC','-c','shared_buffers=128MB','-c','max_connections=40'],'postgres');status['pids']['postgres']=postgres.pid;ready(status['ports']['postgres'],postgres)
  # One structured startup attempt at a time, only SQLSTATE 57P03 may retry.
  bootstrap="const {Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL_OWNER,connectionTimeoutMillis:2000});(async()=>{try{await c.connect();const r=await c.query('SELECT system_identifier::text FROM pg_control_system()');process.stdout.write(JSON.stringify(r.rows[0]))}catch(e){process.stdout.write(e.code||'UNKNOWN');process.exitCode=e.code==='57P03'?75:1}finally{await c.end()}})()"
  readiness=[];until=min(budget.work,budget.clock()+60*10**9)
  while True:
   guard(until);name='c25-c26-readiness-'+str(len(readiness)+1);p=run([node,'--require',BASE/'loopback-only.cjs','-e',bootstrap],name,8,until,{'DATABASE_URL_OWNER':runtime['DATABASE_URL_OWNER']},(0,75));output=(STATE/(name+'.log')).read_text();readiness.append({'exit':p.returncode,'stdout':output});update_json(STATE/'c25-c26-readiness-private.json',readiness)
   if p.returncode==0:system_identifier=json.loads(output)['system_identifier'];assert re.fullmatch('[0-9]+',system_identifier);result['postgresReadyVerified']=True;break
   assert p.returncode==75 and output=='57P03';time.sleep(.1)
  baseline=audit_baseline_with_status(STATE,status,pg_identity,audit,budget.work)
  baseline_bindings=admitted_baseline_bindings(STATE,baseline);private_json(STATE/'c25-c26-admitted-baseline-bindings.json',baseline_bindings)
  redis_child,redis_identity=start([redis,'--bind','127.0.0.1','--port',status['ports']['redis'],'--dir',STATE,'--save','','--appendonly','no','--maxmemory','128mb','--maxmemory-policy','noeviction'],'redis');status['pids']['redis']=redis_child.pid;ready(status['ports']['redis'],redis_child)
  invocation={**budget.invocation(),'schemaVersion':1,'parentPid':os.getpid(),'scope':'ANALYSIS_ONLY_ABBA','database':'eduk12_c25_joint_restore','baseIdentities':[{**pg_identity,'role':'pg_postmaster'},{**redis_identity,'role':'redis'}],'connectionOptions':{'ownerUrl':urlparse(runtime['DATABASE_URL_OWNER'])._replace(path='/eduk12_c25_joint_restore').geturl(),'port':status['ports']['postgres'],'expectedSystemIdentifier':system_identifier,'primaryDatabase':'eduk12_recovery'}}
  private_json(STATE/'c25-c26-driver-invocation-private.json',invocation);guard(budget.work);status['state']='ABBA-running';record_status()
  driver,driver_identity=start([node,'--require',BASE/'loopback-only.cjs',BASE/'c25-c26-analysis-entry.mjs',STATE],'driver',effective);status['pids']['driver']=driver.pid;record_status()
  while driver.poll() is None:guard(budget.driver);time.sleep(.05)
  guard(budget.driver);assert driver.returncode==0;result['driver']=private_read(STATE/'c25-c26-analysis-driver-result-private.json');result['driverResultSha256']=sha_file(STATE/'c25-c26-analysis-driver-result-private.json');result['driverJournal']=private_read(STATE/'c25-c26-analysis-journal-result.json')
  result['driverProof']=validate_driver(result['driver'],result['driverJournal'],STATE/'c25-c26-analysis-events-private.jsonl');result['driverJournalResultSha256']=sha_file(STATE/'c25-c26-analysis-journal-result.json')
  guard(budget.driver)
  result['driverExecuted']=True;result['workloadComplete']=result['driver']['workloadComplete'];result['metricCoverage']=result['driver']['metricCoverage'];result['acceptanceScope']='FIXED_ANALYSIS_ABBA_AND_EXACT_DATA_SAFETY; METRIC_COVERAGE_SEPARATE'
 except BaseException as error:
  failure.append(error);private_json(STATE/'c25-c26-launcher-error-private.json',{'errorType':type(error).__name__,'traceback':traceback.format_exc()})
 finally:
  # No second asynchronous exception may jump over PG shutdown. Independent
  # watchdog remains active and kills all owned groups at the original end.
  cleaning=True
  signal.signal(signal.SIGALRM,signal.SIG_IGN);signal.setitimer(signal.ITIMER_REAL,0)
  for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]:signal.signal(sig,signal.SIG_IGN)
  try:
   stop_all(False)
   assert all(p.poll() is not None for n,p in children if n!='postgres')
   assert not any(r['state'] not in ['Z','X','x'] for r in owned.members(False))
   if baseline_bindings:
    try:
     end=min(budget.overall-(MATERIAL+FINAL_STOP_VERIFY)*10**9,budget.clock()+FINAL_AUDIT*10**9)
     final=audit('final',end);facts=validate_final(final);result.update(finalSnapshotVerified=True,finalSnapshotSha256=final['snapshotSha256'],protectedCoreFacts=facts)
    except BaseException as error:errors.append({'stage':'final-audit','errorType':type(error).__name__})
   if recovery:
    try:
     item=recovery['files']['dataManifest'];out=STATE/'c25-c26-material-audit-result.json'
     argv=[sys.executable,'-B','-c',MATERIAL_PROGRAM,str(node),str(BASE/'c25-c26-analysis-archive.mjs'),item['path'],item['sha256'],str(DATA),str(out)]
     run(argv,'c25-c26-material-audit',MATERIAL,budget.overall-FINAL_STOP_VERIFY*10**9);value=private_read(out);assert value['passed'] is True and value['sourceDataManifest']==item;result['materials']={'passed':True,'resultSha256':sha_file(out),'inlinePythonSha256':hashlib.sha256(MATERIAL_PROGRAM.encode()).hexdigest(),'argv':argv}
    except BaseException as error:errors.append({'stage':'material-audit','errorType':type(error).__name__})
  except BaseException as error:errors.append({'stage':'writer-cleanup','errorType':type(error).__name__})
  finally:
   try:stop_all(True)
   except BaseException as error:
    errors.append({'stage':'postgres-finally','errorType':type(error).__name__})
    try:owned.signal(signal.SIGKILL,True)
    except BaseException as kill_error:errors.append({'stage':'last-kill','errorType':type(kill_error).__name__})
  try:
   if pinned:
    assert sha_file(STATE/'c25-c26-frozen-inputs.json')==frozen_sha and private_read(STATE/'c25-c26-frozen-inputs.json')==pinned
    final_input_verification(a,archive,archive_sha);guard(budget.overall);result['inputVerification']=private_read(STATE/'c25-c26-input-verification-result.json')
   sample();budget.remaining();sync_owned();assert not (DATA/'pgdata/postmaster.pid').exists()
   for name,port in status['ports'].items():
    with socket.socket() as sock:sock.settimeout(.1);assert sock.connect_ex(('127.0.0.1',port))!=0,'service port remains open'
   assert all(p.poll() is not None for _,p in children)
   assert not any(row['role']=='descendant-before-registration' for row in owned.groups.values()),'unregistered child cannot contribute a valid A observation'
   assert not any(r['state'] not in ['Z','X','x'] for r in owned.members(True))
   result['cleanupVerified']=True
  except BaseException as error:errors.append({'stage':'final-verification','errorType':type(error).__name__})
  result['watchdogClose']=finish_watchdog(done,watcher,budget,errors)
  try:sample();budget.remaining()
  except BaseException as error:errors.append({'stage':'final-resources','errorType':type(error).__name__})
  result['signals']=owned.events;result['processIdentityObservations']=owned.identity_observations;result['processEnumerationObservations']=owned.enumeration_observations;result['postgresLineage']=owned.pg_lineage;result['postgresSetsidTransitions']=owned.pg_transitions;result['processExits']={n:p.poll() for n,p in children};result['cleanupErrors']=errors;result['outerFailureTypes']=[type(e).__name__ for e in failure]
  result['passed']=not failure and not errors and result.get('driverExecuted') is True and result['finalSnapshotVerified'] is True and result.get('materials',{}).get('passed') is True and all(result.get('inputVerification',{}).get(k) is True for k in ['passed','inputsUnchanged','sourceUnchanged','recoveryEvidenceUnchanged']) and result.get('cleanupVerified') is True and result.get('postgresReadyVerified') is True and all(type(c)is int and (c==0 or (n.startswith('c25-c26-readiness-') and c==75)) for n,c in result['processExits'].items())
  for log in logs:log.flush();os.fsync(log.fileno());log.close()
  result['elapsedSeconds']=(budget.clock()-budget.started)/1e9
  if result['elapsedSeconds']>=TOTAL:result['passed']=False
  status.update(state='stopped',cleanupVerified=result.get('cleanupVerified',False),cleanupErrors=errors,endedAt=time.time());record_status();result['qualificationPublished']=False;persist_final(STATE/'c25-c26-analysis-controller-result.json',result,budget,sample)
  for sig,handler in previous.items():signal.signal(sig,handler)
  print(json.dumps({'passed':result['passed'],'cleanupVerified':result.get('cleanupVerified',False),'resultSha256':sha_file(STATE/'c25-c26-analysis-controller-result.json')}),flush=True)
 if not result['passed']:raise SystemExit(1)

def supervise_controller(argv,input_text,launch,budget):
 # This parent is independent of the controller's GIL, Node event loops and
 # finally. It owns only one controller child; adopted descendants are captured
 # and reclaimed after that child exits/is stopped, avoiding competing PG roles.
 enable_subreaper();signal.signal(signal.SIGCHLD,signal.SIG_DFL);root=proc(os.getpid());owned=OwnedGroups();owned.root=dict(root);children=[];error=None
 def interrupted(signum,frame):raise TimeoutError('supervisor interrupted '+str(signum))
 previous={n:signal.signal(n,interrupted) for n in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]}
 log=(launch/'controller.log').open('x');p,identity=spawn_registered(owned,children,'driver',argv,cwd=BACKEND,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','NODE_DISABLE_COMPILE_CACHE':'1'},stdin=subprocess.PIPE,stdout=log,stderr=log,start_new_session=True)
 try:
  p.stdin.write(input_text.encode());p.stdin.close()
  while True:
   resources();budget.remaining()
   status=os.waitid(os.P_PID,p.pid,os.WEXITED|os.WNOHANG|os.WNOWAIT)
   if status:break
   time.sleep(.05)
 except BaseException as e:
  error=e
  try:owned.signal(signal.SIGKILL,roles={'driver'})
  except BaseException as q:error=q
 finally:
  # Failure-only reap tail never creates a late PASS.
  cleanup_end=max(budget.overall,time.monotonic_ns()+3*10**9)
  cleanup=reclaim_owned(owned,root,children,cleanup_end,True,grace_seconds=0)
  try:code=p.wait(timeout=max(.001,(cleanup_end-time.monotonic_ns())/1e9))
  except subprocess.TimeoutExpired:code=None
  log.flush();os.fsync(log.fileno());log.close()
  proof={'exitCode':code,'identity':identity,'cleanup':cleanup,'ownedSignals':owned.events,'errorType':type(error).__name__ if error else None,'originalOverallDeadlineMonotonicNs':str(budget.overall),'finishedMonotonicNs':str(time.monotonic_ns()),'passed':error is None and code==0 and cleanup['passed'] and time.monotonic_ns()<budget.overall}
  private_json(launch/'controller-exit.json',proof)
  for n,h in previous.items():signal.signal(n,h)
 return proof

def supervise():
 os.umask(0o077);p=argparse.ArgumentParser();p.add_argument('--expected-head',required=True);a=p.parse_args();assert re.fullmatch('[a-f0-9]{40}',a.expected_head)
 budget=Deadline();assert not LAUNCH.exists() and not STATE.exists();assert all(not p.is_symlink() for p in [LAUNCH,*LAUNCH.parents,STATE])
 lock=(TOOLS/'.measurement.lock').open('rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);resources(True);LAUNCH.mkdir(mode=0o700)
 result={'schemaVersion':1,'passed':False,'scope':'C26_ANALYSIS_ABBA_RELEASE_QUALIFICATION','head':a.expected_head,'deadline':budget.invocation(),'controller':None,'lockReleased':False};error=None
 input_text='PROGRAM_SOURCE='+repr(PROGRAM_SOURCE)+'\nexec(compile(PROGRAM_SOURCE,"analysis-run","exec"))\n'
 try:
  result['controller']=supervise_controller([sys.executable,'-B','-','--controller','--expected-head',a.expected_head,'--started',str(budget.started),'--supervisor-pid',str(os.getpid())],input_text,LAUNCH,budget)
  assert result['controller']['passed'];candidate=private_read(STATE/'c25-c26-analysis-controller-result.json');assert candidate['passed'] is True and candidate['qualificationPublished'] is False
  result.update(workloadComplete=candidate['workloadComplete'],safety={'finalSnapshotVerified':candidate['finalSnapshotVerified'],'materials':candidate['materials'],'cleanupVerified':candidate['cleanupVerified'],'inputs':candidate['inputVerification']},metricCoverage=candidate['metricCoverage'],controllerResultSha256=sha_file(STATE/'c25-c26-analysis-controller-result.json'))
  assert not (DATA/'pgdata/postmaster.pid').exists();resources();budget.remaining()
 except BaseException as e:error=e;result['errorType']=type(e).__name__
 finally:
  # Actual controller exit is already fsynced. Release/reacquire tests no other
  # holder, then release it too; only afterward may overall success be published.
  lock.close()
  try:
   with (TOOLS/'.measurement.lock').open('rb') as check:fcntl.flock(check,fcntl.LOCK_EX|fcntl.LOCK_NB);fcntl.flock(check,fcntl.LOCK_UN)
   result['lockReleased']=True;private_json(LAUNCH/'lock-release.json',{'releasedAndReacquired':True,'controllerExitSha256':sha_file(LAUNCH/'controller-exit.json'),'observedMonotonicNs':str(time.monotonic_ns())});resources();budget.remaining()
  except BaseException as e:error=error or e;result['releaseError']=type(e).__name__
  result['passed']=error is None and result['lockReleased'] and result.get('controller',{}).get('passed') is True
  result['qualificationPublished']=False
  persist_final(LAUNCH/'overall-result.json',result,budget)
 print(json.dumps({'passed':result['passed'],'resultSha256':sha_file(LAUNCH/'overall-result.json'),'lockReleased':result['lockReleased']}))
 if not result['passed']:raise SystemExit(1)
if __name__=='__main__':
 if '--controller' in sys.argv:main()
 else:supervise()
`
export function invocation(argv){assert.equal(argv.length,4);assert.equal(argv[0],'--python');assert.equal(path.resolve(argv[1]),argv[1]);assert.equal(argv[2],'--expected-head');assert.match(argv[3],/^[a-f0-9]{40}$/);return {python:argv[1],args:['-B','-',...argv.slice(2)],input:'PROGRAM_SOURCE='+JSON.stringify(RUN_PYTHON)+'\nexec(compile(PROGRAM_SOURCE,"analysis-run","exec"))\n'}}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const c=invocation(process.argv.slice(2)),p=spawn(c.python,c.args,{stdio:['pipe','inherit','inherit']});let spawnError,closed=false
 const handlers=Object.fromEntries(['SIGTERM','SIGINT','SIGHUP'].map(s=>[s,()=>{if(!closed)p.kill(s)}]));for(const[s,h]of Object.entries(handlers))process.on(s,h)
 p.stdin.on('error',e=>{spawnError??=e});p.stdin.end(c.input);p.on('error',e=>{spawnError??=e;process.exitCode=1})
 p.on('close',(code,signal)=>{closed=true;for(const[s,h]of Object.entries(handlers))process.off(s,h);const root='/workspace/scratch/5a77e8bdc1ae',dir=root+'/c25-build-evidence/c26-analysis-abba-launch-01',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
  const save=(name,value)=>{const fd=fs.openSync(dir+'/'+name,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}const d=fs.openSync(dir,'r');fs.fsyncSync(d);fs.closeSync(d)}
  const result={schemaVersion:1,passed:false,exitCode:code,signal,error:spawnError?.name??null,lockReleased:false};try{
   save('outer-python-exit.json',{pid:p.pid,code,signal,observedMonotonicNs:process.hrtime.bigint().toString(),error:result.error});const prior=JSON.parse(fs.readFileSync(dir+'/overall-result.json'));assert.equal(code,0);assert.equal(signal,null);assert.ok(!spawnError);assert.equal(prior.passed,true);assert.equal(prior.lockReleased,true)
   const guard=()=>{const a=fs.statfsSync(root),b=fs.statfsSync('/tmp'),mem=Number(/^MemAvailable:\s+(\d+) kB$/m.exec(fs.readFileSync('/proc/meminfo','utf8'))[1])*1024;assert.ok(a.bavail*a.bsize>=8*1024**3&&b.bavail*b.bsize>=512*1024**2&&mem>=2*1024**3);assert.ok(process.hrtime.bigint()<BigInt(prior.deadline.overallDeadlineMonotonicNs))}
   guard();Object.assign(result,{passed:true,lockReleased:true,controllerOverallSha256:hash(dir+'/overall-result.json'),outerExitSha256:hash(dir+'/outer-python-exit.json'),releaseSha256:hash(dir+'/lock-release.json')});save('acceptance.json',result);guard()
  }catch(e){result.passed=false;result.finalError=e.name;try{const file=dir+'/acceptance.json';if(fs.existsSync(file)){const fd=fs.openSync(file,'r+');try{fs.ftruncateSync(fd,0);fs.writeFileSync(fd,JSON.stringify(result));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}else save('acceptance.json',result)}catch{}}
  process.stdout.write(JSON.stringify({passed:result.passed,scope:'analysis ABBA actual outer exit and lock release'})+'\n');process.exitCode=result.passed?0:1
 })
}
