/** Outer controller contracts. Actual synthetic process descendants only:
 * no PG/API/Redis, archive, restored DB, business request or measurement run. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {RUN_PYTHON,MATERIAL_PROGRAM,invocation} from './c25-c26-run.mjs'
const base=fileURLToPath(new URL('.',import.meta.url))
function python(body,{timeout=15000}={}){
 const bootstrap=`import json,sys\nfrom unittest import mock\np=json.load(sys.stdin)\nsys.argv=['c26-contract',p['base']]\nscope={'__name__':'c26_outer_contract'}\nexec(compile(p['source'],'<real-outer-controller>','exec'),scope)\nexec(compile(p['body'],'<new-contract>','exec'),scope)`
 const result=spawnSync(process.env.C25_TEST_PYTHON,['-B','-c',bootstrap],{input:JSON.stringify({base,source:RUN_PYTHON,body}),encoding:'utf8',timeout,maxBuffer:2*1024**2,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
 assert.ifError(result.error);assert.equal(result.signal,null);assert.equal(result.status,0,result.stderr||result.stdout)
 return result.stdout
}
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
with mock.patch.dict(groups.signal.__globals__,proc=lambda pid:{**row,'startTicks':'18'}),mock.patch('os.killpg') as kill:
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
assert archive['SOURCE']==DATA and archive['OUTPUT']==Path('/tmp/c25-c26-recovery-01')
assert archive['PRODUCER']==BASE/'c25-c26-archive.mjs'
assert archive['SEED_FIXTURE']==SEED and archive['SEED_FIXTURE_SHA']==SEED_SHA
assert re.fullmatch('[a-f0-9]{64}',inline_sha)
assert 'import {pythonProgram}' in MATERIAL_PROGRAM and 'process.stdout.write(pythonProgram)' in MATERIAL_PROGRAM
assert 'eduk12_c26_a_01/c25-c26-material-audit-result.json' in MATERIAL_PROGRAM
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
