/** One authorized A only. Importing is inert. The outer Python controller owns
 * original 1200s, lock, services, physical recovery and both logical DB baselines. */
import assert from 'node:assert/strict'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {MATERIAL_PYTHON as oldMaterials} from './c25-analysis-resume.mjs'
export const MATERIAL_PROGRAM=oldMaterials.replaceAll('eduk12_c25_analysis_02/c25-analysis-resume-material-audit-result.json','eduk12_c26_a_01/c25-c26-material-audit-result.json').replaceAll('ARCHIVE_PYTHON','pythonProgram')
export const RUN_PYTHON=String.raw`
MATERIAL_PROGRAM=${JSON.stringify(MATERIAL_PROGRAM)}
import argparse,ctypes,fcntl,hashlib,importlib.util,json,os,re,shutil,signal,socket,stat,subprocess,sys,threading,time,traceback
from pathlib import Path
from urllib.parse import urlparse
sys.dont_write_bytecode=True
RUN_SOURCE=sys.orig_argv[sys.orig_argv.index('-c')+1]
BASE=Path(sys.argv.pop(1)).resolve()
def module(name,file):
 spec=importlib.util.spec_from_file_location(name,BASE/file);value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
preflight=module('c26_preflight','c25-contracts.py');source_contract=module('c26_source','c25-source.py')
ROOT,REPO,BACKEND,FRONTEND=preflight.REPO.parent,preflight.REPO,preflight.BACKEND,preflight.FRONTEND
STATE=ROOT/'eduk12_c26_a_01';DATA=ROOT/'eduk12_c25_http_01';CORE=ROOT/'eduk12_c25_continuation_02'
sha_file,digest=preflight.sha_file,preflight.digest
TOTAL,FINAL_AUDIT,MATERIAL,FINAL_STOP_VERIFY,DRIVER_CLEANUP=1200,300,60,60,60
SEED=ROOT/'eduk12_c21_http_01/fixture-private.json';SEED_SHA='86287a00e4a34810c5e8e71afd70dac2f45c89750b9f04560aad67b4506d9239'

def private_json(file,value):
 fd=os.open(file,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as f:json.dump(value,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
def private_read(file):
 s=file.lstat();assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600 and s.st_uid==os.getuid()
 return json.loads(file.read_text())
def update_json(file,value):
 temp=file.with_suffix('.tmp');private_json(temp,value);os.replace(temp,file)
def resource_snapshot():
 return {'diskBytes':shutil.disk_usage(ROOT).free,'tmpBytes':shutil.disk_usage('/tmp').free,'memoryBytes':next(int(x.split()[1])*1024 for x in Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:'))}
def assert_resources(value,entry=False):
 assert value['diskBytes']>=preflight.FLOOR+(preflight.RESERVE if entry else 0) and value['memoryBytes']>=preflight.MEMORY and value['tmpBytes']>=preflight.RESERVE,'resource floor'
 return value
def resources(entry=False):return assert_resources(resource_snapshot(),entry)
class Deadline:
 def __init__(self,clock=time.monotonic_ns):
  self.clock=clock;self.started=clock();self.overall=self.started+TOTAL*10**9;self.driver=self.overall-(FINAL_AUDIT+MATERIAL+FINAL_STOP_VERIFY)*10**9;self.work=self.driver-DRIVER_CLEANUP*10**9
 def remaining(self,end=None):
  value=((self.overall if end is None else end)-self.clock())/10**9
  assert value>0,'original C26 aggregate deadline exhausted';return value
 def invocation(self):
  return {'startedMonotonicNs':str(self.started),'workDeadlineMonotonicNs':str(self.work),'deadlineMonotonicNs':str(self.driver),'overallDeadlineMonotonicNs':str(self.overall),'totalBudgetSeconds':TOTAL,'cleanupReserveSeconds':DRIVER_CLEANUP,'finalAuditReserveSeconds':FINAL_AUDIT,'materialReserveSeconds':MATERIAL,'finalVerificationAndStopReserveSeconds':FINAL_STOP_VERIFY}

def enable_subreaper():
 libc=ctypes.CDLL(None,use_errno=True)
 assert libc.prctl(36,1,0,0,0)==0,'Linux child-subreaper unavailable; no runtime fallback'
 value=ctypes.c_int(0);assert libc.prctl(37,ctypes.byref(value),0,0,0)==0 and value.value==1
 return {'enabled':True,'scope':'THIS_LAUNCHER_DESCENDANTS_ONLY'}

def proc(pid):
 raw=Path('/proc',str(pid),'stat').read_text();parts=raw[raw.rfind(') ')+2:].split()
 assert len(parts)>21
 return {'pid':int(raw.split(' ',1)[0]),'startTicks':parts[19],'processGroupId':int(parts[2]),'parentPid':int(parts[1]),'state':parts[0]}
def process_table():
 rows={}
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:row=proc(int(p.name))
  except FileNotFoundError:continue # A vanished unrelated process is not an empty owned group.
  assert row['pid']==int(p.name);rows[row['pid']]=row
 return rows
class OwnedGroups:
 def __init__(self,postgres_executable=None):self.groups={};self.events=[];self.member_pins={};self.empty_groups=set();self.root=None;self.mutex=threading.RLock();self.postgres_executable=str(Path(postgres_executable).resolve()) if postgres_executable else None
 def register(self,row,role):
  assert row['pid']==row['processGroupId'] and row['pid']!=os.getpgrp(),'only a detached owned group'
  key=(row['pid'],row['startTicks'])
  with self.mutex:
   existing=self.groups.get(row['pid']);assert existing is None or existing['startTicks']==row['startTicks'],'owned PID reused'
   self.groups[row['pid']]={**row,'role':role}
 def capture_descendants(self,root):
  with self.mutex:return self._capture_descendants(root)
 def _capture_descendants(self,root):
  rows=process_table();current=rows.get(root['pid'])
  assert current is not None and current['startTicks']==root['startTicks'],'launcher PID changed'
  if self.root is not None:assert self.root['pid']==root['pid'] and self.root['startTicks']==root['startTicks']
  self.root=dict(root)
  descendants={root['pid']}
  while True:
   added={pid for pid,row in rows.items() if row['parentPid'] in descendants}
   if added<=descendants:break
   descendants|=added
  pg_family={pid for pid,row in self.groups.items() if row['role'] in ['postgres','postgres_child']}
  while True:
   added={pid for pid,row in rows.items() if row['parentPid'] in pg_family}
   if added<=pg_family:break
   pg_family|=added
  for pid in descendants-{root['pid']}:
   row=rows[pid]
   prior=self.member_pins.get(pid);assert prior is None or prior['startTicks']==row['startTicks'],'owned member PID reused'
   assert row['processGroupId'] not in self.empty_groups,'proved-empty PGID reappeared; ownership cannot be reused'
   self.member_pins[pid]=dict(row)
   if row['processGroupId']==pid:
    if pid in self.groups:assert self.groups[pid]['startTicks']==row['startTicks'],'descendant PID reused'
    if pid in pg_family and pid not in self.groups:
     assert self.postgres_executable is not None and str(Path('/proc',str(pid),'exe').resolve(strict=True))==self.postgres_executable,'unproved PostgreSQL descendant executable'
     self.register(row,'postgres_child')
    elif pid not in self.groups:self.register(row,'descendant-before-registration')
   elif row['processGroupId'] not in self.groups:raise AssertionError('unowned descendant process group')
 def import_registry(self,file,driver):
  if not file.exists():return
  value=private_read(file);assert value['schemaVersion']==1 and value['parentPid']==driver['pid']
  for row in value['all']:
   if row['role'] in ['driver','pg_postmaster','redis','pg_background']:continue
   assert row['role'] in ['api','observer','report_worker','export_worker'] and row['parentPid']==driver['pid']
   self.register(row,row['role'])
 def verified_members(self,group,rows):
  leader=rows.get(group['pid']);members=[row for row in rows.values() if row['processGroupId']==group['pid']]
  if group['pid'] in self.empty_groups:assert not members,'proved-empty PGID was reused'
  if leader is not None:
   assert leader['startTicks']==group['startTicks'] and leader['processGroupId']==group['pid'],'group leader PID reused'
  else:
   for row in members:
    pin=self.member_pins.get(row['pid'])
    assert pin is not None and all(pin[k]==row[k] for k in ['pid','startTicks','processGroupId']),'leaderless member has no exact owned identity'
    assert row['parentPid']==pin['parentPid'] or (self.root is not None and row['parentPid']==self.root['pid']),'leaderless member parent drift'
  if not members:self.empty_groups.add(group['pid'])
  return leader,members
 def signal(self,name,include_postgres=False,roles=None):
  with self.mutex:
   entries=list(self.groups.values());rows=process_table();failures=[]
   for row in reversed(entries):
    if (row['role'] in ['postgres','postgres_child'] and not include_postgres) or (roles is not None and row['role'] not in roles):continue
    try:
     leader,members=self.verified_members(row,rows)
     if not members:continue
     if leader is not None:
      current=proc(row['pid']);assert current['startTicks']==row['startTicks'] and current['processGroupId']==row['pid'],'refuse to signal reused/unowned PID'
      try:os.killpg(row['pid'],name);sent=True
      except ProcessLookupError:sent=False
      self.events.append({'pid':row['pid'],'startTicks':row['startTicks'],'signal':int(name),'sent':sent,'method':'VERIFIED_LIVE_LEADER_GROUP','at':time.monotonic_ns()})
     else:
      # Never killpg a stale numerical group after its leader has disappeared.
      # A pidfd pins each previously proved member against PID/PGID reuse.
      for member in members:
       try:fd=os.pidfd_open(member['pid'],0)
       except ProcessLookupError:continue
       try:
        try:current=proc(member['pid'])
        except FileNotFoundError:continue
        assert all(current[k]==member[k] for k in ['pid','startTicks','processGroupId','parentPid']),'leaderless member changed before pidfd signal'
        try:signal.pidfd_send_signal(fd,name,None,0);sent=True
        except ProcessLookupError:sent=False
        self.events.append({'pid':member['pid'],'startTicks':member['startTicks'],'processGroupId':row['pid'],'signal':int(name),'sent':sent,'method':'PINNED_LEADERLESS_MEMBER_PIDFD','at':time.monotonic_ns()})
       finally:os.close(fd)
    except BaseException as error:failures.append(error)
   if failures:raise failures[0] # Other safely owned groups were still attempted.
 def members(self,include_postgres=False):
  with self.mutex:
   rows=process_table();result=[]
   for group in self.groups.values():
    if include_postgres or group['role'] not in ['postgres','postgres_child']:result.extend(self.verified_members(group,rows)[1])
   return result

def spawn_registered(owned,children,name,argv,**options):
 # Capture cannot classify the new postmaster/driver as unknown between spawn
 # and its exact role binding. Dynamic children remain registry-verified later.
 with owned.mutex:
  child=subprocess.Popen(argv,**options);children.append((name,child))
  identity=proc(child.pid);assert identity['parentPid']==os.getpid()
  owned.register(identity,name);return child,identity

def reclaim_owned(owned,root,children,end,include_postgres=False,clock=time.monotonic_ns,grace_seconds=25):
 # First stop a still-running driver, so it cannot continue creating detached
 # writers while the subreaper captures descendants omitted from its registry.
 assert 0<=grace_seconds<=25
 report={'passed':False,'reapedOrphans':[],'errors':[],'popenExits':{}}
 def left():return max(.001,(end-clock())/1e9)
 def attempt(stage,fn):
  try:return fn()
  except BaseException as error:report['errors'].append({'stage':stage,'errorType':type(error).__name__});return None
 for name,child in children:
  if name=='driver' and child.poll() is None:
   report['errors'].append({'stage':'stop-driver','errorType':'DriverStillRunning'})
   attempt('kill-driver',lambda:owned.signal(signal.SIGKILL,roles={'driver'}))
 attempt('capture-before-stop',lambda:owned.capture_descendants(root))
 attempt('term-writers',lambda:owned.signal(signal.SIGTERM))
 if include_postgres:attempt('stop-postgres',lambda:owned.signal(signal.SIGINT,True,roles={'postgres'}))
 grace=min(end,clock()+int(grace_seconds*10**9))
 while True:
  # poll/wait own every Popen exit; never use waitpid(-1).
  for name,child in children:child.poll()
  attempt('capture-during-stop',lambda:owned.capture_descendants(root))
  rows=attempt('members-during-stop',lambda:owned.members(include_postgres))
  if rows is not None and not any(r['state'] not in ['Z','X','x'] for r in rows):break
  if clock()>=grace:
   report['errors'].append({'stage':'graceful-stop','errorType':'OwnedDescendantsSurvived'})
   attempt('kill-survivors',lambda:owned.signal(signal.SIGKILL,include_postgres));break
  time.sleep(min(.02,left()))
 # Reparented orphans are individually reaped only after a current identity and
 # PPID check. Two quiet scans after writers stop close the spawn/register gap.
 until=min(end,clock()+3*10**9);quiet=0;popen_ids={child.pid for _,child in children}
 while True:
  for name,child in children:child.poll()
  attempt('capture-after-stop',lambda:owned.capture_descendants(root))
  rows=attempt('members-after-stop',lambda:owned.members(include_postgres))
  if rows is None:break
  for row in rows:
   if row['parentPid']==root['pid'] and row['pid'] not in popen_ids and row['state'] in ['Z','X','x']:
    def reap():
     current=proc(row['pid']);assert all(current[k]==row[k] for k in ['pid','startTicks','processGroupId','parentPid'])
     pid,status=os.waitpid(row['pid'],os.WNOHANG)
     if pid:report['reapedOrphans'].append({'pid':pid,'startTicks':row['startTicks'],'waitStatus':status,'decodedExitCode':os.waitstatus_to_exitcode(status)})
    attempt('reap-verified-orphan',reap)
  live=[r for r in rows if r['state'] not in ['Z','X','x']]
  quiet=quiet+1 if not live else 0
  if quiet==2:break
  if clock()>=until:
   report['errors'].append({'stage':'final-stop','errorType':'BoundedQuiescenceUnproved'});break
  if live:attempt('kill-late-descendants',lambda:owned.signal(signal.SIGKILL,include_postgres))
  time.sleep(min(.02,left()))
 report['members']=attempt('final-members',lambda:owned.members(include_postgres))
 report['popenExits']={name:child.poll() for name,child in children if include_postgres or name!='postgres'}
 report['passed']=not report['errors'] and all(value is not None for value in report['popenExits'].values()) and report['members'] is not None and not any(r['state'] not in ['Z','X','x'] for r in report['members']) and clock()<end
 return report

def validate_driver(value,journal,journal_file):
 assert value['schemaVersion']==1 and value['phase']=='A' and value['passed'] is True and value['automaticB'] is False and value['automaticRetries']==0
 assert journal['passed'] is True and journal['sha256']==sha_file(journal_file) and journal['bytes']==journal_file.stat().st_size
 expected={'phase':'A','cold':{'parentAttempts':1,'formFinals':1,'scaleFinals':1,'cognitiveFinals':1,'sjtFinals':1,'reportDrainInvocations':1,'reportJobs':1,'exportEnqueues':1,'exportTasks':1},'serialRequests':24,'concurrentWaves':6,'concurrentRequests':12,'maxConcurrency':2,'extraFinals':0,'automaticRetries':0}
 assert value['workload']['counts']==expected and value['readSchedule']=={'serialRequests':24,'waves':6,'concurrentRequests':12}
 assert value['prismaBusiness']['pending']==0 and value['prismaBusiness']['uncertain']==0
 assert value['cleanup'] and all(x['passed'] is True for x in value['cleanup'])
 assert [x['kind'] for x in value['children']]==['report','export']
 for child in value['children']:
  assert child['passed'] is True and child['result']['passed'] is True and child['resources']['terminal']
  lifecycle=child['resources']['lifecycle']
  assert all(lifecycle[k] is True for k in ['closeObserved','groupQuiescent','startAck','terminalAck']) and lifecycle['code']==0 and lifecycle['signal'] is None
 windows=value['windows'];assert windows and all(x['passed'] is True for x in windows)
 reads=[x['operation'] for x in windows if x['operation']['phase'] in ['serial','wave']];assert len(reads)==30
 categories=['checkpoint-recovery-read','report-status','full-report','cognitive-result-or-history','teacher-analysis','existing-artifact-download']
 for i,category in enumerate(categories):
  group=reads[i*5:i*5+5]
  assert [(x['phase'],x['category'],x['requests']) for x in group]==[('serial',category,1)]*4+[('wave',category,2)]
  assert [x['sample'] for x in group[:4]]==[0,1,2,3] and group[4]['concurrency']==2
 assert [x['seconds'] for x in value['tail']]==[30,60]
 return {'fixedWorkloadVerified':True,'serialRequests':24,'concurrentWaves':6,'concurrentRequests':12,'workers':2,'journalSha256':journal['sha256']}

def validate_final(value):
 assert value['passed'] is True and value['mode']=='final' and value['driverPassed'] is True
 facts=value['protectedCoreFacts']
 for key in ['allCoreRowsRetained','allOldCheckpointRowsExact','originalReportsSingletonExact','allColumnsProtected','noColumnOrTableExemptions','liveSchemaExact','primarySnapshotExact','driverPassed']:assert facts[key] is True
 assert facts['oldTables']==217 and facts['oldRows']==6667 and facts['oldCheckpointRows']==21 and facts['historicalRowsEncompassed']==[6529,6582,6651]
 assert facts['addedRowsByTable']['training_attempt_checkpoints']==1
 assert facts['currentRows']>6667
 return facts

def admitted_baseline_bindings(state,baseline):
 assert baseline['passed'] is True and baseline['mode']=='baseline'
 proof=baseline['admission'];assert proof['historicalOrdinalDifferences']==73 and proof['historicalParserDifferences']==3 and proof['parserDdlExecuted'] is False
 assert baseline['capture']['rows']==6667 and baseline['capture']['checkpoints']==21
 paths=[state/'c25-c26-audit-baseline-result.json',state/'c25-c26-protected-rows-private.json',state/'c25-c26-audit-baseline-db-snapshot.json']
 return {str(p):sha_file(p) for p in paths}

def assert_baseline_unchanged(bindings):
 assert bindings and all(sha_file(Path(p))==h for p,h in bindings.items()),'admitted live baseline changed'

def audit_baseline_with_status(state,status,postgres_identity,audit,cutoff):
 # The unchanged Database constructor reads status.json before its first SQL.
 assert set(status['ports'])=={'postgres','redis','api'}
 assert all(type(p)is int and 0<p<65536 for p in status['ports'].values())
 assert status['pids']['postgres']==postgres_identity['pid']
 status.update(state='baseline',postgresIdentity=postgres_identity)
 update_json(state/'status.json',status)
 directory=os.open(state,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(directory)
 finally:os.close(directory)
 return audit('baseline',cutoff)

def persist_final(file,value,budget,check_resources=resources):
 # Required fsync is part of the original deadline. A late durable write can
 # never leave a green receipt, even when no async timer got CPU during I/O.
 value['elapsedSeconds']=(budget.clock()-budget.started)/1e9
 if budget.clock()>=budget.overall:value['passed']=False;value['lateFinalEvidence']=True
 private_json(file,value)
 try:check_resources()
 except BaseException as error:value['passed']=False;value['postWriteResourceFailure']=type(error).__name__
 if budget.clock()>=budget.overall or value.get('postWriteResourceFailure'):
  value['passed']=False;value['lateFinalEvidence']=budget.clock()>=budget.overall;value['elapsedSeconds']=(budget.clock()-budget.started)/1e9;update_json(file,value)
 return value

def finish_watchdog(done,watcher,budget,errors):
 # No background mutation may race a final green receipt. All owned processes
 # are already quiet; final synchronous resource/I/O/deadline checks remain.
 done.set();watcher.join(timeout=min(1,max(0,(budget.overall-budget.clock())/1e9)))
 if watcher.is_alive():errors.append({'stage':'watchdog-close','errorType':'WatchdogNotJoined'})
 if budget.clock()>=budget.overall:errors.append({'stage':'watchdog-close','errorType':'AggregateDeadline'})
 return {'joined':not watcher.is_alive(),'observedMonotonicNs':str(budget.clock())}

def archive_library(node):
 file=BASE/'c25-c26-archive.mjs';code=subprocess.check_output([node,'--input-type=module','-e',"import {pythonProgram} from "+json.dumps(file.as_uri())+";process.stdout.write(pythonProgram)"],text=True,timeout=10)
 archive={'__name__':'c26_recovery_library'};exec(compile(code,str(file),'exec'),archive);return archive,hashlib.sha256(code.encode()).hexdigest()
def validate_build(a,node):
 values=[preflight.validate_build(a.backend_receipt,a.expected_backend_receipt_sha256,'backend',a.expected_head,node),preflight.validate_build(a.frontend_receipt,a.expected_frontend_receipt_sha256,'frontend',a.expected_head,node)]
 assert values[0]['prismaClientReceipt']==values[1]['prismaClientReceipt'];return values

def collect_binding(a,effective,archive_sha):
 tools=a.tools;node=tools/'node_modules/node/bin/node';pg=tools/'postgresql/bin';redis=tools/'redis/bin/redis-server'
 assert not preflight.git('status','--porcelain') and preflight.git('rev-parse','HEAD').decode().strip()==a.expected_head
 assert sha_file(SEED)==SEED_SHA
 refs={str(p):sha_file(p) for p in [a.backend_receipt,a.frontend_receipt,a.descriptor,a.recovery_descriptor,SEED,CORE/'runtime-private.json']}
 for file in [a.backend_receipt,a.frontend_receipt]:
  receipt=json.loads(file.read_text())
  for item in [receipt['prismaClientReceipt'],*receipt['closureEvidence'].values()]:refs[item['path']]=sha_file(Path(item['path']))
  refs[receipt['producerResultPath']]=sha_file(Path(receipt['producerResultPath']))
 return {'head':a.expected_head,'sourceInputs':preflight.source_inventory(),'backendInputs':preflight.component_inputs(BACKEND),'frontendInputs':preflight.component_inputs(FRONTEND),'backendDist':preflight.file_inventory(BACKEND,'dist'),'frontendDist':preflight.file_inventory(FRONTEND,'dist'),'backendDependenciesSha256':digest(preflight.dependency_inventory(BACKEND)),'frontendDependenciesSha256':digest(preflight.dependency_inventory(FRONTEND)),'generatedClient':preflight.file_inventory(BACKEND,'node_modules/.prisma/client'),'launcherPython':{'path':sys.executable,'realpath':str(Path(sys.executable).resolve()),'sha256':sha_file(Path(sys.executable).resolve()),'version':sys.version},'runtimeFingerprint':json.loads(subprocess.check_output([node,BASE/'runtime-fingerprint.cjs',BACKEND],text=True,timeout=30)),'tools':{str(p.relative_to(tools)):sha_file(p) for p in [node,pg/'postgres',pg/'psql',pg/'pg_dump',pg/'pg_restore',pg/'pg_controldata',redis]},'postgresLibraryBytes':{str(p.relative_to(tools)):{'realpath':str(p.resolve()),'sha256':sha_file(p)} for p in sorted((tools/'postgresql/lib').rglob('*')) if p.is_file()},'receiptReferences':refs,'runtimeConfigurationSha256':digest(effective),'inlinePythonSha256':hashlib.sha256(sys.orig_argv[sys.orig_argv.index('-c')+1].encode()).hexdigest(),'archiveInlinePythonSha256':archive_sha}

def final_input_verification(a,archive,archive_sha):
 before=private_read(STATE/'c25-c26-frozen-inputs.json');effective=private_read(STATE/'c25-c26-effective-runtime-private.json')
 actual=preflight.accepted_binding(lambda:collect_binding(a,effective,archive_sha),lambda:validate_build(a,a.tools/'node_modules/node/bin/node'),a.expected_head);assert actual==before
 descriptor=source_contract.validate_descriptor(a.descriptor,a.expected_descriptor_sha256,a.tools/'postgresql/bin/pg_controldata')
 archive['verify_recovery_descriptor'](a.recovery_descriptor,a.expected_recovery_sha256,a.tools,DATA,a.expected_head,check_data=False)
 bindings=private_read(STATE/'c25-c26-input-bindings-private.json')
 assert sha_file(STATE/'c25-c26-frozen-inputs.json')==bindings['frozenInputsSha256']==a.expected_frozen_inputs_sha256
 assert sha_file(STATE/'runtime-private.json')==bindings['runtimeSha256'] and sha_file(STATE/'c25-c26-effective-runtime-private.json')==bindings['effectiveRuntimeSha256']
 private_json(STATE/'c25-c26-input-verification-result.json',{'passed':True,'sourceUnchanged':True,'inputsUnchanged':True,'recoveryEvidenceUnchanged':True,'frozenInputsSha256':sha_file(STATE/'c25-c26-frozen-inputs.json')})

def parse_args():
 p=argparse.ArgumentParser()
 for k in ['tools','state','descriptor','recovery-descriptor','backend-receipt','frontend-receipt']:p.add_argument('--'+k,type=Path,required=True)
 for k in ['expected-head','expected-descriptor-sha256','expected-recovery-sha256','expected-backend-receipt-sha256','expected-frontend-receipt-sha256']:p.add_argument('--'+k,required=True)
 p.add_argument('--verify-only',action='store_true');p.add_argument('--expected-frozen-inputs-sha256');a=p.parse_args()
 assert a.tools==ROOT/'eduk12_tools_20261018' and a.state==STATE and re.fullmatch('[a-f0-9]{40}',a.expected_head)
 for k,v in vars(a).items():
  if k.endswith('sha256') and v is not None:assert re.fullmatch('[a-f0-9]{64}',v)
 assert a.verify_only == (a.expected_frozen_inputs_sha256 is not None)
 return a

def main():
 os.umask(0o077);a=parse_args();budget=Deadline();node=a.tools/'node_modules/node/bin/node';pg=a.tools/'postgresql/bin';redis=a.tools/'redis/bin/redis-server'
 if a.verify_only:
  assert STATE.is_dir();archive,archive_sha=archive_library(node);final_input_verification(a,archive,archive_sha);return
 assert not os.path.lexists(STATE);source_contract.destination_path(STATE,protected=[DATA,CORE,REPO,a.tools,a.descriptor.parent,a.recovery_descriptor.parent,SEED.parent])
 lock=(a.tools/'.measurement.lock').open('rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);entry=resources(True)
 STATE.mkdir(mode=0o700);result={'schemaVersion':1,'scope':'C26_A_ONCE_SYNTHETIC_MEASUREMENT','passed':False,'entryResources':entry,'minimumResources':dict(entry),'deadline':budget.invocation(),'newDatabaseRestoreExecuted':False,'automaticB':False,'processes':[],'audits':{},'finalSnapshotVerified':False,'outerObserverCost':{'samples':0,'threadCpuNs':0,'wallNs':0,'scope':'LAUNCHER_WATCHDOG_RESOURCES_AND_FULL_PROC_DESCENDANT_SCANS; NOT_BUSINESS_CPU'}};status={'state':'preflight','pids':{},'ports':{},'startedAt':time.time()}
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
 env={'PATH':f'{node.parent}:{pg}:/usr/bin:/bin','HOME':str(STATE),'TMPDIR':str(STATE),'LANG':'C.UTF-8','TZ':'UTC','NODE_ENV':'test','PYTHONDONTWRITEBYTECODE':'1'}
 def start(argv,name,extra=None):
  guard();log=(STATE/(name+'.log')).open('x');logs.append(log);p,identity=spawn_registered(owned,children,name,list(map(str,argv)),cwd=BACKEND,env={**env,**(extra or {})},stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
  result['processes'].append({'name':name,'argv':list(map(str,argv)),'identity':identity});return p,identity
 def run(argv,name,seconds,end=None,extra=None,allowed_exits=(0,)):
  allowed=min(seconds,budget.remaining(end));cutoff=min(budget.overall if end is None else end,budget.clock()+int(allowed*10**9));p,_=start(argv,name,extra)
  try:
   while p.poll() is None:guard(cutoff);time.sleep(.05)
   guard(cutoff);assert p.returncode in allowed_exits,name+' failed'
  except BaseException:
   try:os.killpg(p.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   try:p.wait(timeout=min(3,max(.001,(budget.overall-budget.clock())/10**9)))
   except subprocess.TimeoutExpired:pass
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
  label='c25-c26-audit-'+mode;argv=[node,BASE/'c25-c26-db.mjs','--python',sys.executable,'--tools',a.tools,'--state',STATE,'--mode',mode,'--label',label]
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
  archive,archive_sha=archive_library(node);descriptor=source_contract.validate_descriptor(a.descriptor,a.expected_descriptor_sha256,pg/'pg_controldata')
  recovery=archive['verify_recovery_descriptor'](a.recovery_descriptor,a.expected_recovery_sha256,a.tools,DATA,a.expected_head,check_data=True)
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
  pinned=preflight.accepted_binding(lambda:collect_binding(a,effective,archive_sha),lambda:validate_build(a,node),a.expected_head)
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
  invocation={**budget.invocation(),'schemaVersion':1,'parentPid':os.getpid(),'scope':'A_ONCE_NO_AUTOMATIC_B','database':'eduk12_c25_joint_restore','baseIdentities':[{**pg_identity,'role':'pg_postmaster'},{**redis_identity,'role':'redis'}],'connectionOptions':{'ownerUrl':urlparse(runtime['DATABASE_URL_OWNER'])._replace(path='/eduk12_c25_joint_restore').geturl(),'port':status['ports']['postgres'],'expectedSystemIdentifier':system_identifier,'primaryDatabase':'eduk12_recovery'}}
  private_json(STATE/'c25-c26-driver-invocation-private.json',invocation);guard(budget.work);status['state']='A-running';record_status()
  driver,driver_identity=start([node,'--require',BASE/'loopback-only.cjs',BASE/'c25-c26-a-entry.mjs',STATE],'driver',effective);status['pids']['driver']=driver.pid;record_status()
  while driver.poll() is None:guard(budget.driver);time.sleep(.05)
  guard(budget.driver);assert driver.returncode==0;result['driver']=private_read(STATE/'c25-c26-a-driver-result-private.json');result['driverResultSha256']=sha_file(STATE/'c25-c26-a-driver-result-private.json');result['driverJournal']=private_read(STATE/'c25-c26-driver-journal-result.json')
  result['driverProof']=validate_driver(result['driver'],result['driverJournal'],STATE/'c25-c26-driver-events-private.jsonl');result['driverJournalResultSha256']=sha_file(STATE/'c25-c26-driver-journal-result.json')
  guard(budget.driver)
  result['driverExecuted']=True
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
     argv=[sys.executable,'-B','-c',MATERIAL_PROGRAM,str(node),str(BASE/'c25-c26-archive.mjs'),item['path'],item['sha256'],str(DATA),str(out)]
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
    argv=[sys.executable,'-B','-c',RUN_SOURCE,str(BASE),*sys.argv[1:],'--verify-only','--expected-frozen-inputs-sha256',frozen_sha]
    run(argv,'c25-c26-final-inputs',FINAL_STOP_VERIFY,budget.overall);result['inputVerification']=private_read(STATE/'c25-c26-input-verification-result.json')
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
  result['signals']=owned.events;result['processExits']={n:p.poll() for n,p in children};result['cleanupErrors']=errors;result['outerFailureTypes']=[type(e).__name__ for e in failure]
  result['passed']=not failure and not errors and result.get('driverExecuted') is True and result['finalSnapshotVerified'] is True and result.get('materials',{}).get('passed') is True and all(result.get('inputVerification',{}).get(k) is True for k in ['passed','inputsUnchanged','sourceUnchanged','recoveryEvidenceUnchanged']) and result.get('cleanupVerified') is True and result.get('postgresReadyVerified') is True and all(type(c)is int and (c==0 or (n.startswith('c25-c26-readiness-') and c==75)) for n,c in result['processExits'].items())
  for log in logs:log.flush();os.fsync(log.fileno());log.close()
  result['elapsedSeconds']=(budget.clock()-budget.started)/1e9
  if result['elapsedSeconds']>=TOTAL:result['passed']=False
  status.update(state='stopped',cleanupVerified=result.get('cleanupVerified',False),cleanupErrors=errors,endedAt=time.time());record_status();persist_final(STATE/'c25-c26-a-overall-result.json',result,budget,sample)
  lock.close()
  for sig,handler in previous.items():signal.signal(sig,handler)
  print(json.dumps({'passed':result['passed'],'cleanupVerified':result.get('cleanupVerified',False),'resultSha256':sha_file(STATE/'c25-c26-a-overall-result.json')}),flush=True)
 if not result['passed']:raise SystemExit(1)
if __name__=='__main__':
 try:main()
 except BaseException as e:
  if isinstance(e,SystemExit):raise
  print(json.dumps({'passed':False,'errorType':type(e).__name__,'detail':'See private launcher evidence; no automatic retry.'}));raise SystemExit(1)
`
export function invocation(argv){
 assert.equal(argv[0],'--python');assert.ok(path.isAbsolute(argv[1])&&path.resolve(argv[1])===argv[1]);assert.ok(argv.length>2)
 return {python:argv[1],args:['-B','-c',RUN_PYTHON,fileURLToPath(new URL('.',import.meta.url)),...argv.slice(2)]}
}
export async function main(argv=process.argv.slice(2)){
 const {python,args}=invocation(argv),child=spawn(python,args,{stdio:'inherit'})
 const forward=signal=>()=>child.kill(signal),handlers=Object.fromEntries(['SIGTERM','SIGINT','SIGHUP'].map(s=>[s,forward(s)]))
 for(const [s,h]of Object.entries(handlers))process.on(s,h)
 try{return await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve(code??1))})}
 finally{for(const [s,h]of Object.entries(handlers))process.off(s,h)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await main()
