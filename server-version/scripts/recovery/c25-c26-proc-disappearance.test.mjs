/** Proc exit contracts only: actual owned short children plus precise I/O
 * injection. No PostgreSQL, API, Redis, archive or measurement is started. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {spawn,spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {RUN_PYTHON} from './c25-c26-run.mjs'
import {pythonProgram} from './c25-c26-archive.mjs'
import {apiRssObservation} from './c25-c26-a-entry.mjs'
import {runObservedWorker} from './c25-c26-worker-runner.mjs'
const base=fileURLToPath(new URL('.',import.meta.url))
function python(mode,body){
 const bootstrap="import sys,json\nfrom unittest import mock\np=json.load(sys.stdin)\nsys.argv=['c26-proc-contract',p['base']]\ns={'__name__':'c26_proc_contract'}\nwith mock.patch('subprocess.Popen',side_effect=AssertionError('imports must be inert')):exec(compile(p['source'],'<actual-controller>','exec'),s)\nexec(compile(p['body'],'<contract>','exec'),s)"
 const result=spawnSync(process.env.C25_TEST_PYTHON,['-B','-c',bootstrap],{input:JSON.stringify({base,source:mode==='outer'?RUN_PYTHON:pythonProgram,body}),encoding:'utf8',timeout:10000,maxBuffer:1024**2,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
 assert.ifError(result.error);assert.equal(result.signal,null);assert.equal(result.status,0,result.stderr||result.stdout);if(result.stdout.trim())console.log(result.stdout.trim())
}
for(const mode of ['outer','archive'])test(`${mode} enumerator retains an actual child exit between directory enumeration and stat read`,()=>python(mode,String.raw`
from unittest import mock
child=subprocess.Popen([sys.executable,'-c',"import sys;print('ready',flush=True);sys.stdin.read(1)"],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,start_new_session=True)
assert child.stdout.readline().strip()=='ready'
real_read=Path.read_text;target=Path('/proc',str(child.pid));released=False
before=proc(child.pid) if 'proc' in globals() else archive_process_row(child.pid)
if 'proc' in globals():owned=OwnedGroups();owned.register(before,'synthetic')
else:known={child.pid:before};events=[]
def read(p,*args,**kwargs):
 global released
 if p==target/'stat' and not released:
  released=True;child.stdin.write('x');child.stdin.flush();assert child.wait(timeout=2)==0
 return real_read(p,*args,**kwargs)
try:
 with mock.patch.object(Path,'iterdir',return_value=iter([target])),mock.patch.object(Path,'read_text',read):
  if 'proc' in globals():rows=owned.members();events=owned.enumeration_observations
  else:rows=archive_group_members(child.pid,known,events)
 assert rows==[] and len(events)==1 and events[0]['ownedKnown'] is True
 assert events[0]['errno'] in [2,3] and events[0]['freshErrno'] in [2,3]
 assert events[0]['disposition']=='KNOWN_IDENTITY_DIRECTORY_ABSENT'
 assert events[0]['path']==str(target/'stat') and events[0]['expectedIdentity']['startTicks']==before['startTicks']
 assert child.returncode==0 and not target.exists()
 print(json.dumps({'actualChildExit':0,'before':before,'observations':events}))
finally:
 if child.poll() is None:child.kill();child.wait(timeout=2)
 child.stdin.close();child.stdout.close()
`))
test('outer ENOENT and ESRCH retain strict known identity, no signal on reuse, and all other errors reject',()=>python('outer',String.raw`
from unittest import mock
pid=2147483000;target=Path('/proc',str(pid));row={'pid':pid,'parentPid':os.getpid(),'processGroupId':pid,'startTicks':'17','state':'S'}
real_proc=proc
for code in [errno.ENOENT,errno.ESRCH]:
 def fail(_):raise OSError(code,'injected exact disappearance',str(target/'stat'))
 with mock.patch.object(Path,'iterdir',return_value=iter([target])),mock.patch.dict(process_table.__globals__,proc=fail):
  unknown=OwnedGroups();assert unknown.read_table()=={};event=unknown.enumeration_observations[0]
  assert event['errno']==code and event['ownedKnown'] is False and event['disposition']=='ENUMERATION_ITEM_DISAPPEARED_IDENTITY_NOT_OBSERVED'
 for after in [row,{**row,'startTicks':'18'},{**row,'processGroupId':pid+1}]:
  owned=OwnedGroups();owned.register(row,'synthetic');reader=mock.Mock(side_effect=[OSError(code,'injected',str(target/'stat')),after])
  with mock.patch.object(Path,'iterdir',return_value=iter([target])),mock.patch.dict(process_table.__globals__,proc=reader),mock.patch('os.killpg') as kill:
   if after==row:assert owned.members()==[row]
   else:
    try:owned.signal(signal.SIGKILL)
    except AssertionError:pass
    else:raise AssertionError('missing known identity drift accepted')
   kill.assert_not_called();assert owned.enumeration_observations[0]['freshIdentity']==after
 owned=OwnedGroups();owned.register(row,'synthetic')
 with mock.patch.object(Path,'iterdir',return_value=iter([target])),mock.patch.dict(process_table.__globals__,proc=fail,proc_absent=lambda _:False):
  try:owned.members()
  except AssertionError:pass
  else:raise AssertionError('known missing stat treated as empty group despite directory present')
  assert pid not in owned.empty_groups
for code in [errno.EPERM,errno.EACCES,errno.EIO,errno.ENOTDIR]:
 with mock.patch.object(Path,'iterdir',return_value=iter([target])),mock.patch.dict(process_table.__globals__,proc=mock.Mock(side_effect=OSError(code,'not disappearance'))):
  try:process_table()
  except OSError as error:assert error.errno==code
  else:raise AssertionError('other errno ignored')
with mock.patch.object(Path,'read_text',return_value='malformed'):
 try:real_proc(pid)
 except (AssertionError,ValueError,IndexError):pass
 else:raise AssertionError('malformed stat became absence')
# The syscall classifier does not make a pinned stat read optional.
for code in [2,3]:
 with mock.patch.object(Path,'read_text',side_effect=OSError(code,'missing')):
  try:real_proc(pid)
  except OSError as error:assert error.errno==code
  else:raise AssertionError('strict identity reader swallowed disappearance')
print(json.dumps({'exactErrnos':[2,3],'otherErrnosRejected':[1,13,5,20],'reuseAndGroupDriftNeverSignalled':True,'knownMissingRequiresFreshProof':True}))
`))
test('archive ENOENT and ESRCH preserve known member proof and bounded observations without changing held-child authority',()=>python('archive',String.raw`
from unittest import mock
pid=2147483000;target=Path('/proc',str(pid));row={'pid':pid,'parentPid':os.getpid(),'processGroupId':pid,'startTicks':'17','state':'S'}
for code in [2,3]:
 for after in [row,{**row,'startTicks':'18'},{**row,'processGroupId':pid+1}]:
  events=[];reader=mock.Mock(side_effect=[OSError(code,'injected',str(target/'stat')),after])
  with mock.patch.object(Path,'iterdir',return_value=iter([target])),mock.patch.dict(archive_group_members.__globals__,archive_process_row=reader):
   if after==row:assert archive_group_members(pid,{pid:row},events)==[row]
   else:
    try:archive_group_members(pid,{pid:row},events)
    except AssertionError:pass
    else:raise AssertionError('archive member identity drift accepted')
  assert events[0]['ownedKnown'] and events[0]['freshIdentity']==after
 with mock.patch.object(Path,'iterdir',return_value=iter([target])),mock.patch.dict(archive_group_members.__globals__,archive_process_row=mock.Mock(side_effect=OSError(code,'missing'))),mock.patch.object(Path,'stat',return_value=object()):
  try:archive_group_members(pid,{pid:row},[])
  except AssertionError:pass
  else:raise AssertionError('live directory treated as absent')
for code in [1,13,5,20]:
 with mock.patch.object(Path,'iterdir',return_value=iter([target])),mock.patch.dict(archive_group_members.__globals__,archive_process_row=mock.Mock(side_effect=OSError(code,'not disappearance'))):
  try:archive_group_members(pid)
  except OSError as error:assert error.errno==code
  else:raise AssertionError('other errno ignored')
for code in [2,3]:
 with mock.patch.object(Path,'read_text',side_effect=OSError(code,'missing')):
  try:archive_child_identity(pid)
  except OSError as error:assert error.errno==code
  else:raise AssertionError('held child identity swallowed disappearance')
with mock.patch.object(Path,'iterdir',return_value=iter([Path('/proc',str(pid+i)) for i in range(129)])),mock.patch.dict(archive_group_members.__globals__,archive_process_row=mock.Mock(side_effect=OSError(3,'missing'))):
 events=[]
 try:archive_group_members(pid,{},events)
 except AssertionError:pass
 else:raise AssertionError('unbounded observations')
 assert len(events)==128
print(json.dumps({'exactErrnos':[2,3],'knownReappearanceChecked':True,'strictHeldChildUnchanged':True,'perScanCap':128}))
`))
test('API RSS disappearance is explicit NOT_OBSERVED, never zero, with permission and malformed status rejected',{timeout:4000},async()=>{
 assert.ok(apiRssObservation(process.pid).bytes>0)
 const child=spawn(process.execPath,['-e','process.exit(0)'],{stdio:'ignore'});await new Promise(resolve=>child.once('close',resolve))
 const real=apiRssObservation(child.pid);assert.equal(real.status,'NOT_OBSERVED');assert.equal(real.bytes,null);assert.equal(real.ownedKnown,true)
 for(const code of ['ENOENT','ESRCH']){const r=apiRssObservation(child.pid,()=>{throw Object.assign(new Error('injected'),{code})});assert.equal(r.errno,code);assert.equal(r.bytes,null)}
 for(const code of ['EACCES','EPERM','EIO','ENOTDIR'])assert.throws(()=>apiRssObservation(child.pid,()=>{throw Object.assign(new Error('rejected'),{code})}),{code})
 assert.throws(()=>apiRssObservation(child.pid,()=>''),/malformed/)
 console.log(JSON.stringify({realRssAfterClose:real,healthAuthority:'UNCHANGED_INDEPENDENT_DRIVER_API_ASSERT_HEALTHY'}))
})
test('worker startup missing stat records actual early close or explicit unobserved close and preserves the original failure',{timeout:7000},async()=>{
 const root=process.env.C26_PREPARE_EVIDENCE_ROOT;assert.ok(root)
 for(const code of ['ENOENT','ESRCH','EACCES','EIO','ENOTDIR','NO_CLOSE']){
  const directory=fs.mkdtempSync(path.join(root,'worker-startup-proc-'));fs.chmodSync(directory,0o700);let child
  try{
   await assert.rejects(runObservedWorker({directory,kind:'report',input:{},node:fs.realpathSync(process.execPath),env:{PATH:process.env.PATH,DATABASE_URL:'postgresql://eduk12_runtime:synthetic@127.0.0.1:54399/eduk12_c25_joint_restore'},remainingMs:()=>3000,record:()=>{},onFault:()=>{},hooks:{register:()=>{},loaded:()=>{},prepareClose:()=>{},retire:()=>{}}},{
    spawnChild:(node,argv,options)=>child=spawn(node,['-e',code==='NO_CLOSE'?'setInterval(()=>{},1000)':'process.exit(7)'],{...options,env:{PATH:process.env.PATH}}),
    observeChild:()=>{throw new Error('SYNTHETIC_INITIAL_OBSERVER_FAILURE')},
    readStartupIdentity:()=>{throw Object.assign(new Error('injected startup stat'),{code:code==='NO_CLOSE'?'ESRCH':code})}
   }),/SYNTHETIC_INITIAL_OBSERVER_FAILURE/)
   const saved=JSON.parse(fs.readFileSync(path.join(directory,'runner-private.json'),'utf8'));assert.equal(saved.passed,false)
   if(code==='NO_CLOSE'){assert.equal(saved.startupCloseObserved,false);assert.equal(saved.closeObservation,null);assert.ok(saved.startupCloseError)}
   else{assert.equal(saved.startupCloseObserved,true);assert.equal(saved.closeObservation.code,7);assert.equal(saved.closeObservation.signal,null);assert.match(saved.closeObservation.observedMonotonicNs,/^[0-9]+$/)}
   if(['ENOENT','ESRCH','NO_CLOSE'].includes(code)){assert.equal(saved.startupIdentityObservation.status,'NOT_OBSERVED');assert.equal(saved.startupCleanupError,undefined)}else assert.ok(saved.startupCleanupError)
  }finally{if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await new Promise(resolve=>child.once('close',resolve))}}
 }
})

test('direct owned old-parent candidate and pidfd stat disappearance keeps each original proof and never grants a signal',()=>python('outer',String.raw`
from unittest import mock
root=proc(os.getpid());pid=2147483000;oldpid=pid-1
before={'pid':pid,'startTicks':'17','processGroupId':pid,'parentPid':oldpid,'state':'S'};after={**before,'parentPid':root['pid']}
parent={'pid':oldpid,'startTicks':'16','processGroupId':oldpid,'parentPid':root['pid'],'state':'S'}
for code in [2,3]:
 owned=OwnedGroups();owned.root=root;owned.pg_lineage={pid:{'identity':before},oldpid:{'identity':parent}};proofs=[]
 def old_read(p):
  if p==oldpid:raise OSError(code,'precise old-parent exit')
  assert p==root['pid'];return root
 with mock.patch.dict(owned.pg_identity.__globals__,proc=old_read):assert owned.pg_identity(before,after,True,proofs) is False
 assert proofs[0]['oldParentDisposition']=='ABSENT' and proofs[0]['oldParentReadError']['errno']==code
 with mock.patch.dict(owned.pg_identity.__globals__,proc=old_read,proc_absent=lambda _:False):
  try:owned.pg_identity(before,after,True,[])
  except AssertionError:pass
  else:raise AssertionError('old-parent unreadability bypassed exit proof')
 for absent in [False,True]:
  owned=OwnedGroups();owned.root=root;owned.register(parent,'synthetic');member={**before,'processGroupId':oldpid,'parentPid':root['pid']};owned.member_pins[pid]=member
  fd=os.open('/dev/null',os.O_RDONLY)
  try:
   with mock.patch.dict(owned.signal.__globals__,process_table=lambda:{pid:member},proc=mock.Mock(side_effect=OSError(code,'pidfd stat exit')),proc_absent=lambda _:absent),mock.patch('os.pidfd_open',return_value=fd),mock.patch('signal.pidfd_send_signal') as send:
    if absent:owned.signal(signal.SIGKILL);assert owned.events[-1]['errno']==code and owned.events[-1]['sent'] is False
    else:
     try:owned.signal(signal.SIGKILL)
     except AssertionError:pass
     else:raise AssertionError('pidfd stat failure without absence proof accepted')
    send.assert_not_called()
  finally:
   try:os.close(fd)
   except OSError as e:assert e.errno==errno.EBADF
child=subprocess.Popen([sys.executable,'-c',"import sys;print('ready',flush=True);sys.stdin.read(1)"],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,start_new_session=True)
try:
 assert child.stdout.readline().strip()=='ready';row=proc(child.pid);owned=OwnedGroups(sys.executable);owned.root=root;owned.register(row,'postgres');owned.bind_postmaster(child,row)
 for code in [2,3]:
  for absent in [False,True]:
   with mock.patch.dict(owned.postgres_candidate.__globals__,proc=mock.Mock(side_effect=OSError(code,'candidate second stat')),proc_absent=lambda _:absent):
    if absent:assert owned.postgres_candidate(row,{row['pid']:row}) is None
    else:
     try:owned.postgres_candidate(row,{row['pid']:row})
     except AssertionError:pass
     else:raise AssertionError('candidate stat absence without proof accepted')
   event=owned.identity_observations[-1];assert event['statReadFailure']['errno']==code
   assert event['disposition']==('ABSENT' if absent else 'REJECTED')
finally:
 child.stdin.write('x');child.stdin.flush();assert child.wait(timeout=2)==0;child.stdin.close();child.stdout.close()
print(json.dumps({'ownedStatErrnos':[2,3],'oldParentCandidateAndPidfdProofsPreserved':True,'signalGranted':False}))
`))
