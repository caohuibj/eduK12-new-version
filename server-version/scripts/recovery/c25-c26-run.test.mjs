/** Outer controller contracts. Actual synthetic process descendants only:
 * no PG/API/Redis, archive, restored DB, business request or measurement run. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {RUN_PYTHON,MATERIAL_PROGRAM,invocation} from './c25-c26-run.mjs'
import {STATE as databaseState,invocation as databaseInvocation} from './c25-c26-db.mjs'
import {STATE as entryState,main as driverEntry} from './c25-c26-a-entry.mjs'
const base=fileURLToPath(new URL('.',import.meta.url))
function python(body,{timeout=15000}={}){
 const bootstrap=`import json,sys\nfrom unittest import mock\np=json.load(sys.stdin)\nsys.argv=['c26-contract',p['base']]\nscope={'__name__':'c26_outer_contract'}\nexec(compile(p['source'],'<real-outer-controller>','exec'),scope)\nexec(compile(p['body'],'<new-contract>','exec'),scope)`
 const result=spawnSync(process.env.C25_TEST_PYTHON,['-B','-c',bootstrap],{input:JSON.stringify({base,source:RUN_PYTHON,body}),encoding:'utf8',timeout,maxBuffer:2*1024**2,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
 assert.ifError(result.error);assert.equal(result.signal,null);assert.equal(result.status,0,result.stderr||result.stdout)
 return result.stdout
}
test('baseline persists actual ports and PG identity before the unchanged Database constructor reads them',()=>python(String.raw`
import tempfile
from unittest import mock
helper=module('c26_actual_unchanged_db_constructor','c25-db.py')
with tempfile.TemporaryDirectory() as tmp:
 state=Path(tmp);identity={'pid':12345,'startTicks':'67890','processGroupId':12345,'parentPid':os.getpid(),'state':'S'}
 status={'state':'preflight','ports':{},'pids':{}}
 private_json(state/'status.json',status)
 runtime={'DATABASE_URL_OWNER':'postgresql://eduk12_owner:synthetic@127.0.0.1:54329/eduk12_recovery','DATABASE_URL':'postgresql://eduk12_runtime:synthetic@127.0.0.1:54329/eduk12_recovery'}
 private_json(state/'runtime-private.json',runtime)
 with mock.patch('subprocess.Popen',side_effect=AssertionError('no process or database connection')):
  try:helper.Database(ROOT/'eduk12_tools_20261018',state)
  except KeyError as e:assert e.args==('postgres',)
  else:raise AssertionError('original empty-port failure was not reproduced')
  status.update(ports={'postgres':54329,'redis':54330,'api':54331},pids={'postgres':identity['pid']})
  events=[];real_fsync=os.fsync
  def fsync(fd):
   events.append('directory-fsync' if stat.S_ISDIR(os.fstat(fd).st_mode) else 'file-fsync');return real_fsync(fd)
  def actual_audit(mode,cutoff):
   assert events==['file-fsync','directory-fsync'] and mode=='baseline' and cutoff==987654
   stored=private_read(state/'status.json');assert stored==status and stored['postgresIdentity']==identity
   db=helper.Database(ROOT/'eduk12_tools_20261018',state)
   assert db.status==stored and db.owner.port==db.role.port==54329 and db.exits=={}
   return {'actualConstructorRead':True}
  with mock.patch('os.fsync',side_effect=fsync):assert audit_baseline_with_status(state,status,identity,actual_audit,987654)=={'actualConstructorRead':True}
  bad={**runtime,'DATABASE_URL':runtime['DATABASE_URL'].replace(':54329/',':54328/')};update_json(state/'runtime-private.json',bad)
  try:helper.Database(ROOT/'eduk12_tools_20261018',state)
  except AssertionError:pass
  else:raise AssertionError('runtime/status port mismatch admitted')
  called=[]
  with mock.patch('os.fsync',side_effect=OSError('synthetic durability failure')):
   try:audit_baseline_with_status(state,status,identity,lambda *a:called.append(a),987654)
   except OSError:pass
   else:raise AssertionError('failed fsync permitted baseline')
  assert called==[]
 print(json.dumps({'originalEmptyPortRejected':True,'actualUnchangedConstructorAccepted':True,'runtimeMismatchRejected':True,'durabilityFailureBlockedAudit':True}))
`))
test('A05 evidence identity agrees across entry audit controller and materials and rejects all four failed roots',async()=>{
 const current='/workspace/scratch/5a77e8bdc1ae/eduk12_c26_a_05'
 assert.equal(entryState,current);assert.equal(databaseState,current)
 const args=['--python','/usr/bin/python3','--tools','/tools','--state',current,'--mode','baseline','--label','c25-c26-audit-baseline']
 assert.equal(databaseInvocation(args).state,current)
 for(const suffix of ['01','02','03','04']){
  const old=current.replace('_05','_'+suffix);assert.throws(()=>databaseInvocation(args.map(x=>x===current?old:x)))
  const previous=process.argv
  try{process.argv=[previous[0],previous[1],old];await assert.rejects(driverEntry(),/eduk12_c26_a_0[12345]/)}finally{process.argv=previous}
 }
 python("assert STATE==ROOT/'eduk12_c26_a_05'\nassert 'eduk12_c26_a_05/c25-c26-material-audit-result.json' in MATERIAL_PROGRAM\nassert 'eduk12_c26_a_01' not in MATERIAL_PROGRAM and 'eduk12_c26_a_02' not in MATERIAL_PROGRAM and 'eduk12_c26_a_03' not in MATERIAL_PROGRAM and 'eduk12_c26_a_04' not in MATERIAL_PROGRAM")
})
test('one original budget fixes work/driver/final audit tails before preflight and rejects late durable PASS',()=>python(String.raw`
import tempfile
from unittest import mock
now=[1000000000];budget=Deadline(lambda:now[0]);value=budget.invocation()
assert int(value['workDeadlineMonotonicNs'])-budget.started==720*10**9
assert int(value['deadlineMonotonicNs'])-budget.started==780*10**9
assert int(value['overallDeadlineMonotonicNs'])-budget.started==1200*10**9
now[0]=budget.work
try:budget.remaining(budget.work)
except AssertionError:pass
else:raise AssertionError('work consumed reserved cleanup')
assert budget.remaining(budget.driver)==60 and budget.remaining()==480
with tempfile.TemporaryDirectory() as tmp:
 file=Path(tmp)/'result.json';real=private_json
 def slow(file,value):
  real(file,value);now[0]=budget.overall+1
 with mock.patch.dict(persist_final.__globals__,private_json=slow):persist_final(file,{'passed':True},budget)
 result=private_read(file)
 assert result['passed'] is False and result['lateFinalEvidence'] is True and private_read(file)==result
 assert stat.S_IMODE(file.stat().st_mode)==0o600
`))
test('admitted baseline and rows are immediately hash pinned and subsequent tampering cannot reach final audit',()=>python(String.raw`
import tempfile
baseline={'passed':True,'mode':'baseline','capture':{'rows':6667,'checkpoints':21},'admission':{'historicalOrdinalDifferences':73,'historicalParserDifferences':3,'parserDdlExecuted':False}}
with tempfile.TemporaryDirectory() as tmp:
 state=Path(tmp)
 for name in ['c25-c26-audit-baseline-result.json','c25-c26-protected-rows-private.json','c25-c26-audit-baseline-db-snapshot.json']:private_json(state/name,{'actual':'captured'})
 bindings=admitted_baseline_bindings(state,baseline);assert len(bindings)==3;assert_baseline_unchanged(bindings)
 file=state/'c25-c26-protected-rows-private.json';file.write_text('{"tampered":true}')
 try:assert_baseline_unchanged(bindings)
 except AssertionError:pass
 else:raise AssertionError('mutated rows silently rebaselined')
for key,value in [('historicalOrdinalDifferences',74),('historicalParserDifferences',4),('parserDdlExecuted',True)]:
 bad=json.loads(json.dumps(baseline));bad['admission'][key]=value
 try:admitted_baseline_bindings(Path('/not-created'),bad)
 except AssertionError:pass
 else:raise AssertionError('wrong admission accepted')
`))
test('real subreaper captures an unregistered detached orphan, preserves Popen exit7, and reaps only verified orphan',()=>{
 const output=python(String.raw`
import tempfile
os.umask(0o077);assert enable_subreaper()['enabled'] is True
root=proc(os.getpid());owned=OwnedGroups()
with tempfile.TemporaryDirectory() as tmp:
 ready_file=Path(tmp)/'orphan.json'
 script="""import os,sys,time,signal,json
pid=os.fork()
if pid==0:
 os.setsid();signal.signal(signal.SIGTERM,signal.SIG_IGN)
 with open(sys.argv[1],'x') as f:json.dump({'pid':os.getpid()},f);f.flush();os.fsync(f.fileno())
 while True:time.sleep(.01)
else:
 until=time.monotonic()+3
 while not os.path.exists(sys.argv[1]):
  assert time.monotonic()<until;time.sleep(.005)
 sys.exit(7)
"""
 parent=subprocess.Popen([sys.executable,'-B','-c',script,str(ready_file)],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
 own=proc(parent.pid);owned.register(own,'driver')
 try:
  assert parent.wait(timeout=4)==7
  orphan=json.loads(ready_file.read_text())['pid'];actual=proc(orphan);assert actual['parentPid']==os.getpid() and actual['processGroupId']==orphan
  assert orphan not in owned.groups # Real spawn/registry gap, not an injected row.
  report=reclaim_owned(owned,root,[('driver',parent)],time.monotonic_ns()+3*10**9,grace_seconds=.05)
  assert report['passed'] is False and any(e['errorType']=='OwnedDescendantsSurvived' for e in report['errors'])
  assert report['popenExits']=={'driver':7} and parent.returncode==7
  assert owned.groups[orphan]['role']=='descendant-before-registration'
  reaped=[r for r in report['reapedOrphans'] if r['pid']==orphan];assert len(reaped)==1 and reaped[0]['decodedExitCode']==-signal.SIGKILL and os.WIFSIGNALED(reaped[0]['waitStatus'])
  assert not any(r['pid']==parent.pid for r in report['reapedOrphans']) and report['members']==[]
  print(json.dumps({'parentPid':parent.pid,'parentExit':parent.returncode,'orphanPid':orphan,'orphanWait':reaped[0],'quiet':True}))
 finally:
  for group in list(owned.groups):
   try:os.killpg(group,signal.SIGKILL)
   except ProcessLookupError:pass
  parent.wait(timeout=2)
 # A normally closed owned Popen is accepted without stealing its code.
 clean=subprocess.Popen([sys.executable,'-B','-c','pass'],start_new_session=True)
 own=proc(clean.pid);good=OwnedGroups();good.register(own,'driver');assert clean.wait(timeout=2)==0
 result=reclaim_owned(good,root,[('driver',clean)],time.monotonic_ns()+2*10**9,grace_seconds=.05)
 assert result['passed'] and result['popenExits']=={'driver':0} and result['reapedOrphans']==[]
`,{timeout:15000})
 assert.match(output,/"parentExit": 7/);console.log(output.trim())
})
test('only exact owned groups can be signalled and unreadable process identity is never an empty group',()=>python(String.raw`
from unittest import mock
real=proc(os.getpid());groups=OwnedGroups()
try:groups.register(real,'driver')
except AssertionError:pass
else:raise AssertionError('current shared group accepted')
row={'pid':2147483000,'startTicks':'17','processGroupId':2147483000,'parentPid':os.getpid(),'state':'S'};groups.register(row,'driver')
with mock.patch.dict(groups.signal.__globals__,proc=lambda pid:{**row,'startTicks':'18'},process_table=lambda:{row['pid']:{**row,'startTicks':'18'}}),mock.patch('os.killpg') as kill:
 try:groups.signal(signal.SIGKILL)
 except AssertionError:pass
 else:raise AssertionError('reused PID was signalled')
 kill.assert_not_called()
with mock.patch.dict(groups.members.__globals__,process_table=mock.Mock(side_effect=PermissionError('denied'))):
 try:groups.members()
 except PermissionError:pass
 else:raise AssertionError('denied proc treated as quiescent')
`))
test('completion consumes exact counts, journal bytes, worker closes, fixed 36 reads and strict final DB facts',()=>python(String.raw`
import copy,tempfile
categories=['checkpoint-recovery-read','report-status','full-report','cognitive-result-or-history','teacher-analysis','existing-artifact-download']
windows=[]
for category in categories:
 windows += [{'passed':True,'operation':{'phase':'serial','category':category,'requests':1,'sample':i}} for i in range(4)]
 windows += [{'passed':True,'operation':{'phase':'wave','category':category,'requests':2,'concurrency':2}}]
children=[{'kind':kind,'passed':True,'result':{'passed':True},'resources':{'terminal':{'real':'contract fixture'},'lifecycle':{'closeObserved':True,'groupQuiescent':True,'startAck':True,'terminalAck':True,'code':0,'signal':None}}} for kind in ['report','export']]
counts={'phase':'A','cold':{'parentAttempts':1,'formFinals':1,'scaleFinals':1,'cognitiveFinals':1,'sjtFinals':1,'reportDrainInvocations':1,'reportJobs':1,'exportEnqueues':1,'exportTasks':1},'serialRequests':24,'concurrentWaves':6,'concurrentRequests':12,'maxConcurrency':2,'extraFinals':0,'automaticRetries':0}
value={'schemaVersion':1,'phase':'A','passed':True,'automaticB':False,'automaticRetries':0,'workload':{'counts':counts},'readSchedule':{'serialRequests':24,'waves':6,'concurrentRequests':12},'prismaBusiness':{'pending':0,'uncertain':0},'cleanup':[{'passed':True}],'children':children,'windows':windows,'tail':[{'seconds':30},{'seconds':60}]}
with tempfile.TemporaryDirectory() as tmp:
 file=Path(tmp)/'raw';file.write_text('actual journal bytes');journal={'passed':True,'sha256':sha_file(file),'bytes':file.stat().st_size}
 assert validate_driver(value,journal,file)['serialRequests']==24
 changes=[lambda v:v['windows'][0].update(passed=False),lambda v:v['windows'][0]['operation'].update(requests=2),lambda v:v['children'][0]['resources']['lifecycle'].update(groupQuiescent=False),lambda v:v['prismaBusiness'].update(pending=1),lambda v:v['workload']['counts'].update(extraFinals=1)]
 for change in changes:
  bad=copy.deepcopy(value);change(bad)
  try:validate_driver(bad,journal,file)
  except AssertionError:pass
  else:raise AssertionError('incomplete driver accepted')
 file.write_text('mutated journal')
 try:validate_driver(value,journal,file)
 except AssertionError:pass
 else:raise AssertionError('changed journal accepted')
facts={key:True for key in ['allCoreRowsRetained','allOldCheckpointRowsExact','originalReportsSingletonExact','allColumnsProtected','noColumnOrTableExemptions','liveSchemaExact','primarySnapshotExact','driverPassed']};facts.update(oldTables=217,oldRows=6667,oldCheckpointRows=21,historicalRowsEncompassed=[6529,6582,6651],addedRowsByTable={'training_attempt_checkpoints':1},currentRows=6680)
final={'passed':True,'mode':'final','driverPassed':True,'protectedCoreFacts':facts};assert validate_final(final)==facts
for key in ['originalReportsSingletonExact','primarySnapshotExact','allColumnsProtected']:
 bad=copy.deepcopy(final);bad['protectedCoreFacts'][key]=False
 try:validate_final(bad)
 except AssertionError:pass
 else:raise AssertionError('protected DB failure ignored')
`))
test('fixed archive export and adapted material reader load actual frozen libraries without service I/O',()=>python(String.raw`
node=ROOT/'eduk12_tools_20261018/node_modules/node/bin/node'
archive,inline_sha=archive_library(node)
assert archive['SOURCE']==DATA and archive['OUTPUT']==Path('/tmp/c25-c26-recovery-05')
assert archive['PRODUCER']==BASE/'c25-c26-archive.mjs'
assert archive['SEED_FIXTURE']==SEED and archive['SEED_FIXTURE_SHA']==SEED_SHA
assert re.fullmatch('[a-f0-9]{64}',inline_sha)
assert 'import {pythonProgram}' in MATERIAL_PROGRAM and 'process.stdout.write(pythonProgram)' in MATERIAL_PROGRAM
assert 'eduk12_c26_a_05/c25-c26-material-audit-result.json' in MATERIAL_PROGRAM
scope={'__name__':'material_library'};exec(compile(MATERIAL_PROGRAM,'<materials>','exec'),scope)
assert callable(scope['verify_old_materials'])
`))
test('unchanged resource thresholds distinguish entry reserve from running floors and CLI binds exact Python',()=>{
 const value=invocation(['--python','/opt/python3','--state','/state'])
 assert.equal(value.python,'/opt/python3');assert.deepEqual(value.args.slice(0,4),['-B','-c',RUN_PYTHON,base])
 for(const bad of [['--python','python3','--state','/state'],['--python','/tmp/../python3','--state','/state'],['--state','/state']])assert.throws(()=>invocation(bad))
 assert.ok(MATERIAL_PROGRAM.includes('verify_old_materials'))
 python(String.raw`
value={'diskBytes':8*1024**3,'memoryBytes':2*1024**3,'tmpBytes':512*1024**2}
assert_resources(value)
try:assert_resources(value,True)
except AssertionError:pass
else:raise AssertionError('entry reserve silently consumed')
value['diskBytes']+=512*1024**2;assert_resources(value,True)
for key in value:
 bad=value.copy();bad[key]=0
 try:assert_resources(bad)
 except AssertionError:pass
 else:raise AssertionError('resource floor ignored')
`)
})
test('proved PostgreSQL process family is isolated from writer stops and later reclaimed separately',()=>python(String.raw`
import tempfile
os.umask(0o077);enable_subreaper();root=proc(os.getpid());owned=OwnedGroups(sys.executable)
with tempfile.TemporaryDirectory() as tmp:
 marker=Path(tmp)/'ready.json'
 script="""import os,sys,time,signal,json
pid=os.fork()
if pid==0:
 os.setsid()
 with open(sys.argv[1],'x') as f:json.dump({'pid':os.getpid()},f);f.flush();os.fsync(f.fileno())
 while True:time.sleep(.01)
else:
 def done(sig,frame):
  os.killpg(pid,signal.SIGTERM);os.waitpid(pid,0);sys.exit(0)
 signal.signal(signal.SIGINT,done)
 while True:time.sleep(.01)
"""
 leader=subprocess.Popen([sys.executable,'-B','-c',script,str(marker)],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
 try:
  owned.register(proc(leader.pid),'postgres');owned.bind_postmaster(leader,proc(leader.pid));end=time.monotonic()+3
  while not marker.exists():assert time.monotonic()<end;time.sleep(.005)
  child=json.loads(marker.read_text())['pid'];owned.capture_descendants(root)
  assert owned.groups[child]['role']=='postgres_child' and owned.members(False)==[]
  report=reclaim_owned(owned,root,[('postgres',leader)],time.monotonic_ns()+2*10**9,grace_seconds=.05)
  assert report['passed'] and leader.poll() is None and proc(child)['state'] not in ['Z','X','x']
  result=reclaim_owned(owned,root,[('postgres',leader)],time.monotonic_ns()+3*10**9,True,grace_seconds=1)
  assert result['passed'] and result['popenExits']=={'postgres':0} and result['members']==[]
  print(json.dumps({'syntheticPostmasterPid':leader.pid,'syntheticChildPid':child,'writerStopLeftFamilyAlive':True,'finalExit':leader.returncode}))
 finally:
  for pid in list(owned.groups):
   try:os.killpg(pid,signal.SIGKILL)
   except ProcessLookupError:pass
  leader.wait(timeout=2)
`))
test('final verdict waits for watchdog fault completion and cannot race an unjoined monitor',()=>python(String.raw`
done=threading.Event();errors=[];failure=[];budget=Deadline()
def last_fault():
 done.wait();failure.append(RuntimeError('last observed floor failure'))
watcher=threading.Thread(target=last_fault);watcher.start()
proof=finish_watchdog(done,watcher,budget,errors)
assert proof['joined'] and not errors and len(failure)==1 # Failure is visible before the final verdict.
release=threading.Event();watcher=threading.Thread(target=lambda:release.wait(2));watcher.start();budget.overall=budget.clock()+20*10**6
try:
 proof=finish_watchdog(threading.Event(),watcher,budget,errors)
 assert proof['joined'] is False and any(e['errorType']=='WatchdogNotJoined' for e in errors)
finally:release.set();watcher.join(timeout=1)
`))
test('launcher spawn registration blocks capture at the real identity gap before PG child classification',()=>{
 const output=python(String.raw`
import tempfile
from unittest import mock
os.umask(0o077);enable_subreaper();root=proc(os.getpid());owned=OwnedGroups(sys.executable);children=[]
identity_gap=threading.Event();capture_attempt=threading.Event();release_identity=threading.Event();captured=threading.Event();values={};errors=[];real_proc=proc
class ObservableLock:
 def __init__(self,lock):self.lock=lock
 def __enter__(self):
  if threading.current_thread().name=='monitor-contract':capture_attempt.set()
  self.lock.acquire();return self
 def __exit__(self,*args):self.lock.release()
owned.mutex=ObservableLock(owned.mutex)
with tempfile.TemporaryDirectory() as tmp:
 marker=Path(tmp)/'ready.json'
 script="""import os,sys,time,signal,json
pid=os.fork()
if pid==0:
 os.setsid()
 with open(sys.argv[1],'x') as f:json.dump({'pid':os.getpid()},f);f.flush();os.fsync(f.fileno())
 while True:time.sleep(.01)
else:
 def done(sig,frame):
  os.killpg(pid,signal.SIGTERM);os.waitpid(pid,0);sys.exit(0)
 signal.signal(signal.SIGINT,done)
 while True:time.sleep(.01)
"""
 def paused_proc(pid):
  if threading.current_thread().name=='spawn-contract':
   until=time.monotonic()+3
   while not marker.exists():assert time.monotonic()<until;time.sleep(.005)
   identity_gap.set();assert release_identity.wait(3)
  return real_proc(pid)
 def spawn_task():
  try:values['spawn']=spawn_registered(owned,children,'postgres',[sys.executable,'-B','-c',script,str(marker)],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
  except BaseException as error:errors.append(error)
 def capture_task():
  try:owned.capture_descendants(root);captured.set()
  except BaseException as error:errors.append(error)
 spawn_thread=threading.Thread(target=spawn_task,name='spawn-contract');monitor=threading.Thread(target=capture_task,name='monitor-contract')
 try:
  with mock.patch.dict(spawn_registered.__globals__,proc=paused_proc):
   spawn_thread.start();assert identity_gap.wait(3);monitor.start();assert capture_attempt.wait(3)
   assert not captured.is_set() and not owned.groups,'capture must block while exact role has not been bound'
   release_identity.set();spawn_thread.join(3);monitor.join(3)
   assert not spawn_thread.is_alive() and not monitor.is_alive() and not errors and captured.is_set()
  leader,identity=values['spawn'];child=json.loads(marker.read_text())['pid']
  assert owned.groups[leader.pid]['role']=='postgres' and owned.groups[child]['role']=='postgres_child'
  assert not any(row['role']=='descendant-before-registration' for row in owned.groups.values())
  owned.signal(signal.SIGTERM);assert leader.poll() is None and real_proc(child)['state'] not in ['Z','X','x']
  proof=reclaim_owned(owned,root,children,time.monotonic_ns()+3*10**9,True,grace_seconds=1)
  assert proof['passed'] and proof['popenExits']=={'postgres':0} and proof['members']==[]
  print(json.dumps({'captureBlockedInsideSpawnIdentityGap':True,'postmasterRoleExact':True,'childRoleExact':True,'leaderPid':leader.pid,'childPid':child,'exitCode':leader.returncode}))
 finally:
  release_identity.set();spawn_thread.join(3)
  if monitor.ident is not None:monitor.join(3)
  for _,child in children:
   if child.poll() is None:
    try:os.killpg(child.pid,signal.SIGKILL)
    except ProcessLookupError:pass
   child.wait(timeout=2)
  for pid in list(owned.groups):
   try:os.killpg(pid,signal.SIGKILL)
   except ProcessLookupError:pass
`,{timeout:15000})
 console.log(output.trim())
})
test('leaderless members require pinned identity, use real pidfd, and reject a reused empty PGID',()=>{
 const output=python(String.raw`
import tempfile
from unittest import mock
os.umask(0o077);enable_subreaper();root=proc(os.getpid());owned=OwnedGroups();children=[]
with tempfile.TemporaryDirectory() as tmp:
 marker=Path(tmp)/'member.json'
 script="""import os,sys,time,signal,json
pid=os.fork()
if pid==0:
 signal.signal(signal.SIGTERM,signal.SIG_IGN)
 with open(sys.argv[1],'x') as f:json.dump({'pid':os.getpid()},f);f.flush();os.fsync(f.fileno())
 while True:time.sleep(.01)
else:
 until=time.monotonic()+3
 while not os.path.exists(sys.argv[1]):
  assert time.monotonic()<until;time.sleep(.005)
 sys.exit(7)
"""
 leader,identity=spawn_registered(owned,children,'driver',[sys.executable,'-B','-c',script,str(marker)],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
 try:
  assert leader.wait(timeout=4)==7;member=json.loads(marker.read_text())['pid'];owned.capture_descendants(root)
  current=proc(member);assert current['parentPid']==root['pid'] and current['processGroupId']==leader.pid and not Path('/proc',str(leader.pid)).exists()
  assert owned.member_pins[member]['startTicks']==current['startTicks']
  with mock.patch('os.killpg',side_effect=AssertionError('leaderless killpg forbidden')):
   owned.signal(signal.SIGTERM);owned.signal(signal.SIGKILL)
   result=reclaim_owned(owned,root,children,time.monotonic_ns()+2*10**9,grace_seconds=.1)
  assert result['passed'] and result['popenExits']=={'driver':7} and result['members']==[]
  assert any(r['pid']==member and r['decodedExitCode']==-signal.SIGKILL for r in result['reapedOrphans'])
  assert all(e['method']=='PINNED_LEADERLESS_MEMBER_PIDFD' for e in owned.events)
  assert leader.pid in owned.empty_groups
  foreign={**current,'pid':2147483001,'startTicks':'999','parentPid':1,'state':'S'}
  # A new unrelated group can outlive its newly reused leader. No signal API
  # may be called merely because its numerical PGID matches our old group.
  with mock.patch.dict(owned.signal.__globals__,process_table=lambda:{foreign['pid']:foreign}),mock.patch('os.killpg') as group_kill,mock.patch('os.pidfd_open') as open_pid:
   try:owned.signal(signal.SIGKILL)
   except AssertionError:pass
   else:raise AssertionError('reused empty PGID was accepted')
   group_kill.assert_not_called();open_pid.assert_not_called()
  fresh=OwnedGroups();fresh.register(identity,'driver')
  for rows in [{foreign['pid']:foreign},{member:{**current,'startTicks':'999'}}]:
   with mock.patch.dict(fresh.signal.__globals__,process_table=lambda:rows),mock.patch('os.killpg') as group_kill,mock.patch('os.pidfd_open') as open_pid:
    try:fresh.signal(signal.SIGKILL)
    except AssertionError:pass
    else:raise AssertionError('unproved leaderless member was accepted')
    group_kill.assert_not_called();open_pid.assert_not_called()
  print(json.dumps({'leaderPid':leader.pid,'leaderExit':leader.returncode,'memberPid':member,'pidfdSignalMethods':[e['method'] for e in owned.events],'orphanWaitStatuses':result['reapedOrphans'],'emptyGroupReuseRejected':True}))
 finally:
  for pid in [member] if 'member' in globals() else []:
   try:os.kill(pid,signal.SIGKILL)
   except ProcessLookupError:pass
  leader.wait(timeout=2)
`,{timeout:15000})
 console.log(output.trim())
})
test('mandatory final write rechecks actual resource callback and persists false on floor failure',()=>python(String.raw`
import tempfile
budget=Deadline();observed=[]
with tempfile.TemporaryDirectory() as tmp:
 file=Path(tmp)/'final.json'
 def changed_resources():
  assert file.exists() and private_read(file)['passed'] is True
  value={'diskBytes':preflight.FLOOR-1,'memoryBytes':preflight.MEMORY,'tmpBytes':preflight.RESERVE};observed.append(value);return assert_resources(value)
 result=persist_final(file,{'passed':True},budget,changed_resources)
 assert len(observed)==1 and result['passed'] is False and result['postWriteResourceFailure']=='AssertionError'
 assert result['lateFinalEvidence'] is False and private_read(file)==result and stat.S_IMODE(file.stat().st_mode)==0o600
`))
test('fresh PG lifecycle identity records real short exits and rejects invalid ownership frames',()=>{
 const output=python(String.raw`
from unittest import mock
os.umask(0o077);enable_subreaper();root=proc(os.getpid());observations=[]
script="""import os,sys,signal,time
pid=os.fork()
if pid==0:
 os.setsid()
 while True:time.sleep(.01)
else:
 print(pid,flush=True);reaped=False
 try:
  for command in sys.stdin:
   if command.strip()=='reap':
    _,status=os.waitpid(pid,0);reaped=True;print(status,flush=True)
   elif command.strip()=='exit':break
 finally:
  if not reaped:
   try:os.kill(pid,signal.SIGKILL)
   except ProcessLookupError:pass
   os.waitpid(pid,0)
"""
for disposition in ['ABSENT','TERMINAL']:
 leader=subprocess.Popen([sys.executable,'-B','-c',script],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,start_new_session=True)
 child=None;owned=OwnedGroups(sys.executable);real_resolve=Path.resolve;seen=[]
 try:
  owned.register(proc(leader.pid),'postgres');owned.bind_postmaster(leader,proc(leader.pid));child=int(leader.stdout.readline());end=time.monotonic()+3
  while proc(child)['processGroupId']!=child:assert time.monotonic()<end;time.sleep(.001)
  before=proc(child);target=Path('/proc',str(child),'exe')
  def exit_before_exe(file,*args,**kwargs):
   if file==target and not seen:
    seen.append(True);os.kill(child,signal.SIGTERM)
    until=time.monotonic()+3
    while proc(child)['state'] not in ['Z','X','x']:assert time.monotonic()<until;time.sleep(.001)
    if disposition=='ABSENT':
     leader.stdin.write('reap\n');leader.stdin.flush();assert os.WIFSIGNALED(int(leader.stdout.readline()))
     assert not Path('/proc',str(child)).exists()
   return real_resolve(file,*args,**kwargs)
  with mock.patch.object(Path,'resolve',exit_before_exe):owned.capture_descendants(root)
  events=[e for e in owned.identity_observations if e['before']['pid']==child];assert len(events)==1;event=events[0]
  assert event['disposition']==disposition and event['exeVerifiedForActiveProcess'] is False and event['exeObserved'] is None and event['cpu']=='NOT_OBSERVED'
  assert all(event['before'][k]==before[k] for k in ['pid','startTicks','processGroupId','parentPid'])
  if disposition=='ABSENT':assert child not in owned.groups and event['after'] is None
  else:
   assert owned.groups[child]['role']=='postgres_terminal_candidate' and event['after']['state']=='Z'
   assert owned.members(False)==[] # Not an active executable-verified writer.
   # The exact subreaper adoption is legal and its terminal status is reaped
   # through the original per-PID wait, without stealing the Popen's exit.
   leader.kill();assert leader.wait(timeout=2)==-signal.SIGKILL
   proof=reclaim_owned(owned,root,[('postgres',leader)],time.monotonic_ns()+2*10**9,True,grace_seconds=.05)
   assert proof['passed'] and proof['members']==[] and proof['popenExits']['postgres']==-signal.SIGKILL
   assert any(x['pid']==child and os.WIFSIGNALED(x['waitStatus']) for x in proof['reapedOrphans'])
  observations.append(event)
 finally:
  if leader.poll() is None:
   leader.stdin.write('exit\n');leader.stdin.flush();assert leader.wait(timeout=2)==0
  leader.stdin.close();leader.stdout.close()
  if child is not None:
   try:os.kill(child,signal.SIGKILL)
   except ProcessLookupError:pass
   try:os.waitpid(child,os.WNOHANG)
   except ChildProcessError:pass
print(json.dumps({'actualExitObservations':observations}))
`,{timeout:15000})
 console.log(output.trim())
})
test('failed command cleanup rejects reused owned identity and still bounded waits its Popen',()=>python(String.raw`
from unittest import mock
row={'pid':2147483000,'startTicks':'17','processGroupId':2147483000,'parentPid':os.getpid(),'state':'S'}
owned=OwnedGroups();owned.register(row,'readiness-contract');child=mock.Mock(pid=row['pid']);child.wait.return_value=7
with mock.patch.dict(owned.signal.__globals__,process_table=lambda:{row['pid']:{**row,'startTicks':'18'}}),mock.patch('os.killpg') as kill:
 try:stop_failed_command(owned,child,row,'readiness-contract',time.monotonic_ns()+10**9)
 except AssertionError:pass
 else:raise AssertionError('reused command process group was signalled')
 kill.assert_not_called();child.wait.assert_called_once();assert 0<child.wait.call_args.kwargs['timeout']<=1
child.wait.reset_mock()
with mock.patch.dict(owned.signal.__globals__,process_table=lambda:{row['pid']:row},proc=lambda pid:row),mock.patch('os.killpg') as kill:
 stop_failed_command(owned,child,row,'readiness-contract',time.monotonic_ns()+10**9)
 kill.assert_called_once_with(row['pid'],signal.SIGKILL);child.wait.assert_called_once()
print(json.dumps({'reusedGroupSignalDenied':True,'waitStillCalled':True,'exactOwnedSignalPermitted':True}))
`))
test('held postmaster lineage admits live exe ENOENT for every real member and rejects ownership counterexamples with frames',()=>{
 const output=python(String.raw`
import tempfile,copy
from unittest import mock
os.umask(0o077);enable_subreaper();root=proc(os.getpid());children=[]
script="""import os,sys,signal,time,json
pid=os.fork()
if pid==0:
 os.setsid();member=os.fork()
 if member==0:
  while True:time.sleep(.01)
 with open(sys.argv[1]+'.tmp','x') as f:json.dump({'leader':os.getpid(),'member':member},f);f.flush();os.fsync(f.fileno())
 os.rename(sys.argv[1]+'.tmp',sys.argv[1])
 while True:time.sleep(.01)
else:
 def done(sig,frame):
  os.killpg(pid,signal.SIGTERM);os.waitpid(pid,0);sys.exit(0)
 signal.signal(signal.SIGINT,done)
 while True:time.sleep(.01)
"""
with tempfile.TemporaryDirectory() as tmp:
 marker=Path(tmp)/'members.json';owned=OwnedGroups(sys.executable)
 master,identity=spawn_registered(owned,children,'postgres',[sys.executable,'-B','-c',script,str(marker)],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
 try:
  until=time.monotonic()+3
  while not marker.exists():assert time.monotonic()<until;time.sleep(.002)
  ids=json.loads(marker.read_text());leader,member=ids['leader'],ids['member'];real_resolve=Path.resolve;real_proc=proc
  targets={Path('/proc',str(pid),'exe') for pid in [leader,member]}
  def missing_exe(file,*args,**kwargs):
   if file in targets:raise FileNotFoundError('synthetic exact exe ENOENT on real live identity')
   return real_resolve(file,*args,**kwargs)
  with mock.patch.object(Path,'resolve',missing_exe):
   owned.capture_descendants(root);assert owned.members(False)==[]
   rows=owned.members(True);assert {r['pid'] for r in rows}=={master.pid,leader,member}
  assert owned.groups[leader]['role']=='postgres_child' and member not in owned.groups
  assert all(pid in owned.pg_lineage for pid in [master.pid,leader,member])
  events=[e for e in owned.identity_observations if e['before']['pid'] in [leader,member]]
  assert len(events)==2 and all(e['disposition']=='LIVE' and e['exeStatus']=='NOT_OBSERVED_ENOENT' and not e['exeVerifiedForActiveProcess'] for e in events)
  assert all(e['before']['startTicks']==e['after']['startTicks'] and e['lineage'][-1]['pid']==master.pid for e in events)
  rejections=[];rejected_frames=[]
  def one_fault(name):
   check=OwnedGroups(sys.executable);check.register(identity,'postgres');check.bind_postmaster(master,identity);check.root=root
   rows=process_table();candidate=rows[leader];calls=[]
   if name=='newly-adopted':rows[leader]={**candidate,'parentPid':root['pid']};candidate=rows[leader]
   if name=='unknown-parent':rows[leader]={**candidate,'parentPid':2147483000};candidate=rows[leader]
   if name=='replaced-held-binding':check.groups[master.pid]={**check.groups[master.pid],'startTicks':'reused'}
   def fresh(pid):
    value=real_proc(pid)
    if pid==leader and name=='pid-reuse':value={**value,'startTicks':'reused'}
    if pid==leader and name=='group-drift':value={**value,'processGroupId':master.pid}
    if pid==leader and name=='parent-drift':value={**value,'parentPid':1}
    if pid==master.pid and name=='ancestor-reuse':value={**value,'startTicks':'reused'}
    if pid==leader and name=='parse':raise ValueError('synthetic stat parse')
    return value
   def exe(file,*args,**kwargs):
    if file==Path('/proc',str(leader),'exe'):
     if name=='permission':raise PermissionError('synthetic exe permission')
     if name=='wrong-executable':return Path('/unrelated/writer')
     raise FileNotFoundError('synthetic missing exe')
    return real_resolve(file,*args,**kwargs)
   with mock.patch.object(Path,'resolve',exe),mock.patch.dict(check.postgres_candidate.__globals__,proc=fresh),mock.patch('os.killpg') as group_signal,mock.patch('os.pidfd_open') as pid_signal:
    try:check.postgres_candidate(candidate,rows)
    except (AssertionError,PermissionError,ValueError):rejections.append(name)
    else:raise AssertionError('ownership counterexample admitted: '+name)
    group_signal.assert_not_called();pid_signal.assert_not_called()
   assert len(check.identity_observations)==1
   event=check.identity_observations[0];assert event['disposition']=='REJECTED' and event['before']==candidate and event['after'] is not None and event['errorType']
   rejected_frames.append({'case':name,'observation':event})
  for name in ['newly-adopted','unknown-parent','replaced-held-binding','pid-reuse','group-drift','parent-drift','ancestor-reuse','permission','parse','wrong-executable']:one_fault(name)
  # Known PGID never substitutes for a PG lineage proof, even for a nonleader.
  foreign={**real_proc(member),'pid':2147483001,'parentPid':1,'startTicks':'foreign'};actual=process_table();actual[foreign['pid']]=foreign
  with mock.patch.dict(owned.capture_descendants.__globals__,process_table=lambda:copy.deepcopy(actual)),mock.patch('os.killpg') as group_signal,mock.patch('os.pidfd_open') as pid_signal:
   try:owned.capture_descendants(root)
   except AssertionError as error:assert 'lineage proof' in str(error)
   else:raise AssertionError('unknown member hidden behind PG role')
   group_signal.assert_not_called();pid_signal.assert_not_called()
  assert owned.identity_observations[-1]['disposition']=='REJECTED' and owned.identity_observations[-1]['before']==foreign
  # Previously proved PG lineage survives exact subreaper adoption. Brand-new
  # orphans above were rejected; the shared group still uses original pidfd rules.
  master.kill();assert master.wait(timeout=2)==-signal.SIGKILL
  owned.capture_descendants(root)
  assert owned.pg_lineage[leader]['anchor']=='PREVIOUSLY_PROVED_PG_SUBREAPER_ADOPTION'
  owned.signal(signal.SIGTERM,True,roles={'postgres_child'})
  proof=reclaim_owned(owned,root,children,time.monotonic_ns()+3*10**9,True,grace_seconds=.05)
  assert proof['passed'] and proof['members']==[] and proof['popenExits']=={'postgres':-signal.SIGKILL},json.dumps({'proof':proof,'observations':owned.identity_observations})
  print(json.dumps({'realLiveMissingExeObservations':events,'rejectedFrames':rejected_frames,'unknownSameGroupMemberRejected':True,'previouslyProvedAdoptionAccepted':True,'reclaim':proof}))
 finally:
  if master.poll() is None:
   try:os.killpg(master.pid,signal.SIGKILL)
   except ProcessLookupError:pass
  master.wait(timeout=2)
  if marker.exists():
   for pid in json.loads(marker.read_text()).values():
    try:os.kill(pid,signal.SIGKILL)
    except ProcessLookupError:pass
    try:os.waitpid(pid,os.WNOHANG)
    except ChildProcessError:pass
`,{timeout:15000})
 console.log(output.trim())
})
test('actual direct PG child setsid transition is accepted once with both frames and never signals the old group',()=>{
 const output=python(String.raw`
from unittest import mock
os.umask(0o077);enable_subreaper();root=proc(os.getpid());records=[]
script="""import os,sys,signal,time,json
r,w=os.pipe();pid=os.fork()
if pid==0:
 os.close(w);print(json.dumps({'ready':os.getpid()}),flush=True);assert os.read(r,1)==b's';os.setsid();print(json.dumps({'setsid':os.getpid()}),flush=True)
 while True:time.sleep(.01)
else:
 os.close(r)
 def done(sig,frame):
  os.kill(pid,signal.SIGTERM);os.waitpid(pid,0);sys.exit(0)
 signal.signal(signal.SIGINT,done)
 for line in sys.stdin:
  assert line.strip()=='setsid';os.write(w,b's')
"""
for mode in ['between-captures','inside-bracket']:
 owned=OwnedGroups(sys.executable);children=[]
 master,master_identity=spawn_registered(owned,children,'postgres',[sys.executable,'-B','-c',script],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,start_new_session=True)
 try:
  child=json.loads(master.stdout.readline())['ready'];before=proc(child);assert before['parentPid']==master.pid and before['processGroupId']==master.pid
  owned.capture_descendants(root);assert child in owned.pg_lineage and child not in owned.groups
  def transition():
   master.stdin.write('setsid\n');master.stdin.flush();assert json.loads(master.stdout.readline())=={'setsid':child}
  if mode=='between-captures':transition();owned.capture_descendants(root)
  else:
   real_resolve=Path.resolve;triggered=[]
   def exe(file,*args,**kwargs):
    if file==Path('/proc',str(child),'exe') and not triggered:triggered.append(True);transition()
    return real_resolve(file,*args,**kwargs)
   with mock.patch.object(Path,'resolve',exe):owned.capture_descendants(root)
   assert triggered==[True]
  after=proc(child);assert after['processGroupId']==child
  assert len(owned.pg_transitions)==1;event=owned.pg_transitions[0]
  assert event['before']['processGroupId']==master.pid and event['after']['processGroupId']==child
  assert all(event['before'][k]==event['after'][k] for k in ['pid','startTicks','parentPid'])
  assert owned.pg_lineage[child]['identity']['processGroupId']==child and owned.groups[child]['role']=='postgres_child'
  assert [r['pid'] for r in owned.verified_members(owned.groups[master.pid],process_table())[1]]==[master.pid]
  owned.capture_descendants(root);assert len(owned.pg_transitions)==1
  for bad in [{**after,'processGroupId':master.pid},{**after,'processGroupId':2147483001},{**after,'parentPid':root['pid'],'processGroupId':master.pid},{**after,'startTicks':'reused'}]:
   try:owned.pg_identity(after,bad)
   except AssertionError:pass
   else:raise AssertionError('invalid later PG transition accepted')
  with mock.patch('os.killpg') as group_signal:
   owned.signal(signal.SIGTERM,True,roles={'postgres_child'});group_signal.assert_called_once_with(child,signal.SIGTERM)
  result=reclaim_owned(owned,root,children,time.monotonic_ns()+3*10**9,True,grace_seconds=1)
  assert result['passed'] and result['popenExits']=={'postgres':0}
  records.append({'mode':mode,'transition':event,'noOldGroupSignal':True,'reclaim':result})
 finally:
  if master.poll() is None:
   try:os.killpg(master.pid,signal.SIGKILL)
   except ProcessLookupError:pass
  master.wait(timeout=2);master.stdin.close();master.stdout.close()
  if 'child' in globals():
   try:os.kill(child,signal.SIGKILL)
   except ProcessLookupError:pass
   try:os.waitpid(child,os.WNOHANG)
   except ChildProcessError:pass
print(json.dumps({'realSetsidContracts':records}))
`,{timeout:15000})
 console.log(output.trim())
})
test('proved PG orphan adoption during the exe bracket retains exact parent exit proof and refuses a live old parent',()=>{
 const output=python(String.raw`
from unittest import mock
os.umask(0o077);enable_subreaper();root=proc(os.getpid());owned=OwnedGroups(sys.executable);children=[]
script="""import os,sys,signal,time,json
pid=os.fork()
if pid==0:
 os.setsid();member=os.fork()
 if member==0:
  while True:time.sleep(.01)
 print(json.dumps({'parent':os.getpid(),'member':member}),flush=True)
 while True:time.sleep(.01)
else:
 for line in sys.stdin:
  if line.strip()=='reap':print(json.dumps({'status':os.waitpid(pid,0)[1]}),flush=True)
  elif line.strip()=='exit':break
"""
master,identity=spawn_registered(owned,children,'postgres',[sys.executable,'-B','-c',script],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,start_new_session=True)
try:
 ids=json.loads(master.stdout.readline());parent,member=ids['parent'],ids['member'];owned.capture_descendants(root)
 before=proc(member);assert before['parentPid']==parent and before['processGroupId']==parent
 try:owned.pg_identity(before,{**before,'parentPid':root['pid']},adoption=True,adoptions=[])
 except AssertionError as error:assert 'old-parent exit proof' in str(error)
 else:raise AssertionError('live old parent was called an adoption')
 real_resolve=Path.resolve;triggered=[]
 def exe(file,*args,**kwargs):
  if file==Path('/proc',str(member),'exe') and not triggered:
   triggered.append(True);os.kill(parent,signal.SIGTERM);master.stdin.write('reap\n');master.stdin.flush();assert os.WIFSIGNALED(json.loads(master.stdout.readline())['status'])
   assert not Path('/proc',str(parent)).exists() and proc(member)['parentPid']==root['pid']
  return real_resolve(file,*args,**kwargs)
 with mock.patch.object(Path,'resolve',exe):owned.capture_descendants(root)
 assert triggered==[True];event=owned.pg_lineage[member]['adoption']
 assert event['before']['parentPid']==parent and event['after']['parentPid']==root['pid']
 assert all(event['before'][k]==event['after'][k] for k in ['pid','startTicks','processGroupId'])
 assert event['oldParentIdentity']['pid']==parent and event['oldParentAfter'] is None and event['oldParentDisposition']=='ABSENT'
 assert event['subreaperIdentity']['pid']==root['pid']
 assert any(e['adoptions'] and e['before']['pid']==member for e in owned.identity_observations)
 for bad in [{**proc(member),'parentPid':parent},{**proc(member),'parentPid':1}]:
  rows=process_table();rows[member]=bad
  try:owned.postgres_candidate(bad,rows)
  except AssertionError:pass
  else:raise AssertionError('adopted member changed to an unapproved parent')
 # This member has no group leader now; the original pinned pidfd path remains.
 owned.signal(signal.SIGTERM,True,roles={'postgres_child'})
 master.stdin.write('exit\n');master.stdin.flush();assert master.wait(timeout=2)==0
 proof=reclaim_owned(owned,root,children,time.monotonic_ns()+3*10**9,True,grace_seconds=.1)
 assert proof['passed'] and proof['members']==[],json.dumps({'proof':proof,'observations':owned.identity_observations})
 assert any(e['pid']==member and e['method']=='PINNED_LEADERLESS_MEMBER_PIDFD' for e in owned.events)
 print(json.dumps({'controlledAdoption':event,'liveParentRejected':True,'laterParentDriftRejected':True,'reclaim':proof}))
finally:
 if master.poll() is None:
  try:os.killpg(master.pid,signal.SIGKILL)
  except ProcessLookupError:pass
 master.wait(timeout=2);master.stdin.close();master.stdout.close()
 for pid in [parent,member] if 'member' in globals() else []:
  try:os.kill(pid,signal.SIGKILL)
  except ProcessLookupError:pass
  try:os.waitpid(pid,os.WNOHANG)
  except ChildProcessError:pass
`,{timeout:15000})
 console.log(output.trim())
})
test('direct PG exclusion entries reject an unproved same-group member without signalling or extra table scans',()=>{
 const output=python(String.raw`
from unittest import mock
import copy
os.umask(0o077);root=proc(os.getpid());owned=OwnedGroups(sys.executable);children=[]
master,identity=spawn_registered(owned,children,'postgres',[sys.executable,'-B','-c','import time; time.sleep(10)'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
try:
 owned.capture_descendants(root);actual=process_table()
 foreign={**identity,'pid':2147483001,'startTicks':'foreign','parentPid':1};actual[foreign['pid']]=foreign;results=[]
 for entry in ['members','signal']:
  with mock.patch.dict(owned.members.__globals__,process_table=mock.Mock(side_effect=lambda:copy.deepcopy(actual))),mock.patch('os.killpg') as group_signal,mock.patch('os.pidfd_open') as pid_signal:
   scan=owned.members.__globals__['process_table']
   try:
    if entry=='members':owned.members(False)
    else:owned.signal(signal.SIGTERM,False)
   except AssertionError as error:assert 'lineage proof' in str(error)
   else:raise AssertionError('excluded unproved PG member: '+entry)
   assert scan.call_count==1;group_signal.assert_not_called();pid_signal.assert_not_called()
  event=owned.identity_observations[-1];assert event['disposition']=='REJECTED' and event['before']==foreign and event['after']['unavailableErrorType']=='FileNotFoundError'
  results.append({'entry':entry,'singleScan':True,'rejection':event})
 print(json.dumps({'directExclusionContracts':results}))
finally:
 master.kill();assert master.wait(timeout=2)==-signal.SIGKILL
`,{timeout:10000})
 console.log(output.trim())
})
