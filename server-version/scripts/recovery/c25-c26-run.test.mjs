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
test('A02 evidence identity agrees across the actual entry audit controller and material reader and rejects A01',async()=>{
 const current='/workspace/scratch/5a77e8bdc1ae/eduk12_c26_a_02',old=current.replace('_02','_01')
 assert.equal(entryState,current);assert.equal(databaseState,current)
 const args=['--python','/usr/bin/python3','--tools','/tools','--state',current,'--mode','baseline','--label','c25-c26-audit-baseline']
 assert.equal(databaseInvocation(args).state,current);assert.throws(()=>databaseInvocation(args.map(x=>x===current?old:x)))
 const previous=process.argv
 try{process.argv=[previous[0],previous[1],old];await assert.rejects(driverEntry(),/eduk12_c26_a_0[12]/)}finally{process.argv=previous}
 python("assert STATE==ROOT/'eduk12_c26_a_02'\nassert 'eduk12_c26_a_02/c25-c26-material-audit-result.json' in MATERIAL_PROGRAM\nassert 'eduk12_c26_a_01' not in MATERIAL_PROGRAM")
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
assert archive['SOURCE']==DATA and archive['OUTPUT']==Path('/tmp/c25-c26-recovery-02')
assert archive['PRODUCER']==BASE/'c25-c26-archive.mjs'
assert archive['SEED_FIXTURE']==SEED and archive['SEED_FIXTURE_SHA']==SEED_SHA
assert re.fullmatch('[a-f0-9]{64}',inline_sha)
assert 'import {pythonProgram}' in MATERIAL_PROGRAM and 'process.stdout.write(pythonProgram)' in MATERIAL_PROGRAM
assert 'eduk12_c26_a_02/c25-c26-material-audit-result.json' in MATERIAL_PROGRAM
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
  owned.register(proc(leader.pid),'postgres');end=time.monotonic()+3
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
