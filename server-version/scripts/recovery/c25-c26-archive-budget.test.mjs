/** Staged admission and real tiny child/pipe faults only. No archive, SQL,
 * database service, business API or measurement workload is executed. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'
import {pythonProgram} from './c25-c26-archive.mjs'
function python(body){
 const script="import json,sys\nfrom unittest import mock\np=json.load(sys.stdin)\ns={'__name__':'c26_budget_contract'}\nwith mock.patch('subprocess.Popen',side_effect=AssertionError('inert imports required')):exec(compile(p['source'],'<archive>','exec'),s)\nexec(compile(p['body'],'<contract>','exec'),s)"
 const r=spawnSync(process.env.C25_TEST_PYTHON,['-B','-c',script],{input:JSON.stringify({source:pythonProgram,body}),encoding:'utf8',timeout:15000,maxBuffer:1024**2,env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}})
 assert.ifError(r.error);assert.equal(r.signal,null);assert.equal(r.status,0,r.stderr||r.stdout);if(r.stdout.trim())console.log(r.stdout.trim())
}
test('two archive admissions retain original floors and count only future tmpfs increments',()=>python(String.raw`
full=json.loads(FROZEN_A01.read_text());data=data_projection(full);bounds=staged_bounds(data)
old=recovery_budget(data,{'workspaceFreeBytes':10**12,'tmpFreeBytes':10**12,'memAvailableBytes':10**12})
assert bounds['extractionReserveBytes']==old['extractionReserveBytes'] and bounds['sourceLogicalBytes']==old['sourceLogicalBytes']
first={'workspaceFreeBytes':A['FLOOR']+A['RESERVE'],'tmpFreeBytes':A['RESERVE']+A['ARCHIVE_CAP']+METADATA_CAP,'memAvailableBytes':A['MEMORY']+A['ARCHIVE_CAP']+METADATA_CAP+A['PROCESS_RESERVE']}
compression=staged_admission(bounds,first,'COMPRESS');assert first['tmpFreeBytes']<old['requiredTmpFreeBytes']
pin={'bytes':271635666,'allocatedBytes':271638528,'links':1};used=20*1024**2
second={'workspaceFreeBytes':A['FLOOR'],'tmpFreeBytes':A['RESERVE']+bounds['extractionReserveBytes']+METADATA_CAP-used,'memAvailableBytes':A['MEMORY']+bounds['extractionReserveBytes']+METADATA_CAP-used+A['PROCESS_RESERVE']}
extraction=staged_admission(bounds,second,'EXTRACT',used,pin)
assert extraction['archiveAddedAgain'] is False and extraction['compressedAlreadyOccupiesFreeSpace']==pin
assert extraction['futureTmpfsIncrementBytes']==bounds['extractionReserveBytes']+METADATA_CAP-used
for phase,current,charge,archive in [('COMPRESS',first,0,None),('EXTRACT',second,used,pin)]:
 for key in ['tmpFreeBytes','memAvailableBytes','workspaceFreeBytes']:
  bad={**current,key:current[key]-1}
  try:staged_admission(bounds,bad,phase,charge,archive)
  except AssertionError:pass
  else:raise AssertionError('stage threshold weakened: '+phase+' '+key)
print(json.dumps({'extractionUpperBoundUnchanged':bounds['extractionReserveBytes'],'compression':compression,'extraction':extraction}))
`))
test('metadata allocation uses rounded hard bounds and preserves dedicated false receipt space',()=>python(String.raw`
import tempfile
from unittest import mock
with tempfile.TemporaryDirectory() as tmp,mock.patch.dict(C26EvidenceWriter.__init__.__globals__,METADATA_CAP=16*4096,FAILURE_EVIDENCE_RESERVE=4*4096,DIRECTORY_CHARGE=4096):
 root=Path(tmp);writer=C26EvidenceWriter(root);writer.bytes(root/'normal.json',b'x'*(10*4096))
 assert writer.charged==12*4096
 try:writer.bytes(root/'too-much.json',b'x')
 except AssertionError:pass
 else:raise AssertionError('normal evidence consumed failure reserve')
 assert not (root/'too-much.json').exists()
 writer.json(root/'archive-failure-private.json',{'passed':False},failure=True)
 writer.bytes(root/'archive-failure-private.log',b'actual cap failure',failure=True)
 assert writer.charged==16*4096
 assert all(stat.S_IMODE(p.stat().st_mode)==0o600 for p in root.iterdir())
 assert json.loads((root/'archive-failure-private.json').read_text())['passed'] is False
 assert sum(p.stat().st_blocks*512 for p in root.iterdir())<=writer.charged
print(json.dumps({'roundedHardCapVerified':True,'failureEvidenceStillFits':True}))
`))
test('failed second admission retains compressed bytes without creating extraction or descriptor',()=>python(String.raw`
import tempfile
from unittest import mock
with tempfile.TemporaryDirectory() as tmp:
 root=Path(tmp);partial=root/'archive.part';sync_bytes(partial,b'synthetic-compressed-identity-contract')
 bounds=staged_bounds(data_projection(json.loads(FROZEN_A01.read_text())));writer=C26EvidenceWriter(root);evidence={};restore=root/'verification-restore';before=compressed_allocation(partial)
 assert writer.allocated()<writer.charged # Unused directory/rounding reserve is still future allocation.
 current={'workspaceFreeBytes':A['FLOOR'],'tmpFreeBytes':A['RESERVE']+bounds['extractionReserveBytes']+METADATA_CAP-writer.allocated()-1,'memAvailableBytes':10**12}
 try:admit_extraction(partial,bounds,writer,lambda:current,lambda:restore.mkdir(),before['sha256'],evidence)
 except AssertionError as error:
  writer.json(root/'archive-failure-private.json',{'passed':False,'errorType':type(error).__name__,'evidence':evidence},failure=True)
 else:raise AssertionError('insufficient second phase admitted')
 assert not restore.exists() and not (root/NAMES['descriptor']).exists() and compressed_allocation(partial)==before
 assert evidence['compressedArchiveBeforeRoundTrip']==before
 for drift in [{**before,'inode':before['inode']+1},{**before,'blocks':before['blocks']+1},{**before,'sha256':'0'*64}]:
  calls=[]
  with mock.patch.dict(admit_extraction.__globals__,compressed_allocation=mock.Mock(side_effect=[before,drift])):
   try:admit_extraction(partial,bounds,writer,lambda:{**current,'tmpFreeBytes':10**12},lambda:calls.append('mkdir'),before['sha256'],{})
   except AssertionError:pass
   else:raise AssertionError('compressed binding drift accepted')
  assert calls==[]
 print(json.dumps({'compressedRetained':True,'restoreNotCreated':True,'descriptorNotIssued':True,'pinned':before}))
`))
test('real bounded pipe preserves wait ownership and cleans overflow deadline waitid and proc failures',()=>python(String.raw`
import ctypes,tempfile
from unittest import mock
assert ctypes.CDLL(None,use_errno=True).prctl(36,1,0,0,0)==0
proofs=[];real_waitid=os.waitid
def guard():return None
with tempfile.TemporaryDirectory() as tmp:
 root=Path(tmp)
 # Successful child: WNOWAIT is used and Popen.wait is the only consumer.
 writer=C26EvidenceWriter(root);flags=[]
 def observe(*args):flags.append(args[2]);return real_waitid(*args)
 with mock.patch('os.waitid',side_effect=observe),mock.patch.object(subprocess.Popen,'poll',side_effect=AssertionError('poll would consume exit')):
  step=bounded_archive_pipe([sys.executable,'-B','-c','print("ok")'],root/'success.log',2,guard,writer,time.monotonic()+3)
 assert step['exitCode']==0 and flags and all(f&os.WNOWAIT for f in flags);proofs.append(step)
 def run_fault(kind):
   writer=C26EvidenceWriter(root);log=root/(kind+'.log');kwargs={};actual_reaped=[]
   script='import time;time.sleep(10)'
   if kind=='overflow':script='import os;os.write(1,b"x"*65536)'
   if kind=='deadline-descendant-pipe':script='import os,time\np=os.fork()\nif p: print(p,flush=True);os._exit(7)\nelse:\n while True:time.sleep(.01)'
   if kind=='ECHILD-reaped':script='raise SystemExit(7)'
   def wait_fault(*args):
    if kind=='waitid-denied':raise PermissionError('synthetic WNOWAIT denial')
    if kind=='ECHILD-reaped':
     pid,status=os.waitpid(args[1],0);actual_reaped.append({'pid':pid,'status':status});raise ChildProcessError(errno.ECHILD,'externally reaped child')
    return real_waitid(*args)
   real_identity=archive_child_identity
   def identity_fault(pid):
    if kind=='identity-denied':raise PermissionError('synthetic identity denial')
    return real_identity(pid)
   with mock.patch.dict(bounded_archive_pipe.__globals__,LOG_CAP=4096,archive_child_identity=identity_fault),mock.patch('os.waitid',side_effect=wait_fault),mock.patch.object(subprocess.Popen,'poll',side_effect=AssertionError('poll forbidden')):
    try:bounded_archive_pipe([sys.executable,'-B','-c',script],log,.2 if kind=='deadline-descendant-pipe' else 2,guard,writer,time.monotonic()+4)
    except (AssertionError,PermissionError,ChildProcessError) as error:
     step=error.archive_step;proofs.append({'kind':kind,**step})
    else:raise AssertionError('fault unexpectedly passed: '+kind)
   assert step['passed'] is False and step['cleanupErrors']==[] and log.stat().st_size<=4096
   if kind=='ECHILD-reaped':
    assert step['ownershipLost'] and not step['groupKillSent'] and not step['waitOwnershipVerified'] and step['exitCode'] is None
    assert len(actual_reaped)==1 and os.waitstatus_to_exitcode(actual_reaped[0]['status'])==7
   else:assert step['groupKillSent'] and step['waitOwnershipVerified'] and type(step['exitCode'])is int
   if kind=='deadline-descendant-pipe':
    descendant=int(log.read_text().strip());end=time.monotonic()+1
    while True:
     pid,status=os.waitpid(descendant,os.WNOHANG)
     if pid:break
     assert time.monotonic()<end;time.sleep(.001)
    assert os.WIFSIGNALED(status) and os.waitstatus_to_exitcode(status)==-signal.SIGKILL and step['exitCode']==7
    step['actualOrphanWaitStatus']=status
   assert not Path('/proc',str(step['pid'])).exists()
 for kind in ['overflow','deadline-descendant-pipe','waitid-denied','identity-denied','ECHILD-reaped']:run_fault(kind)
print(json.dumps({'realPipeSteps':proofs,'servicesStarted':False,'archivesCreated':False}))
`))

test('archive watcher joins within the original deadline before successful publication',()=>python(String.raw`
from unittest import mock
import threading
class Thread:
 def __init__(self,mode,clock):self.mode=mode;self.clock=clock;self.timeouts=[]
 def join(self,timeout):
  self.timeouts.append(timeout)
  if self.mode=='late':self.clock[0]=100.01
 def is_alive(self):return self.mode=='unjoined'
class Guard:
 def __init__(self,mode,clock):self.finished=threading.Event();self.thread=Thread(mode,clock);self.checks=0
 def check(self):self.checks+=1;return None
proof=[]
for mode in ['healthy','late','unjoined']:
 clock=[99.5];guard=Guard(mode,clock);published=[]
 with mock.patch('time.monotonic',side_effect=lambda:clock[0]):
  try:
   result=stop_archive_guard_before_publication(guard,100)
   published.append(result)
  except AssertionError:assert mode!='healthy'
  else:assert mode=='healthy'
 assert guard.finished.is_set() and guard.thread.timeouts==[.5]
 assert bool(published)==(mode=='healthy')
 proof.append({'mode':mode,'publicationAllowed':bool(published),'joinTimeout':guard.thread.timeouts,'resourceChecks':guard.checks})
print(json.dumps({'originalAggregateDeadlineAndJoinGate':proof}))
`))
