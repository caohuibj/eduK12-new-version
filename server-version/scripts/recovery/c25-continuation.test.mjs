/** New launcher contracts only: no archive, service, build or database is run. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {CONTINUATION_PYTHON,continuationArgv} from './c25-continuation.mjs'
const base=path.dirname(fileURLToPath(import.meta.url))
function python(body){
 const bootstrap=String.raw`
import ast,copy,importlib.util,json,os,re,tempfile
from pathlib import Path
from types import SimpleNamespace
source=SOURCE
tree=ast.parse(source)
names={'continuation_budget','continuation_destination','inherited_phases','continuation_complete'}
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
constants={'PHASES','PHASE_SECONDS','FAILED_RECEIPT_SHA','FAILED_SNAPSHOT_SHA'}
nodes+=[n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in constants for t in n.targets)]
preflight=SimpleNamespace(RESERVE=512*1024**2,MEMORY=2*1024**3)
FLOOR=8*1024**3
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-continuation-contracts>','exec'))
def reject(fn):
 try:fn()
 except AssertionError:return
 raise AssertionError('unsafe continuation accepted')
`
 const program=bootstrap.replace('source=SOURCE','source='+JSON.stringify(CONTINUATION_PYTHON))+'\n'+body
 const r=spawnSync(process.env.C25_TEST_PYTHON??'python3',['-B','-c',program],{encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024})
 assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.equal(r.status,0,r.stderr||r.stdout)
}
test('no-clone admission retains exact reserve, disk, memory and tmp floors',()=>python(String.raw`
assert continuation_budget(FLOOR+preflight.RESERVE,preflight.MEMORY,preflight.RESERVE)['cloneBytes']==0
for values in [(FLOOR+preflight.RESERVE-1,preflight.MEMORY,preflight.RESERVE),(FLOOR+preflight.RESERVE,preflight.MEMORY-1,preflight.RESERVE),(FLOOR+preflight.RESERVE,preflight.MEMORY,preflight.RESERVE-1)]:reject(lambda:continuation_budget(*values))
`))
test('continuation destination is independent, new, direct and unaliased',()=>python(String.raw`
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory)
 assert continuation_destination(root/'eduk12_c25_continuation_01',root)==root/'eduk12_c25_continuation_01'
 for name in ['eduk12_c25_http_01','eduk12_c23_http_03','eduk12_c25_continuation_1','sub/eduk12_c25_continuation_01']:reject(lambda:continuation_destination(root/name,root))
 (root/'eduk12_c25_continuation_01').mkdir();reject(lambda:continuation_destination(root/'eduk12_c25_continuation_01',root))
 (root/'link').symlink_to(root,target_is_directory=True);reject(lambda:continuation_destination(root/'link/eduk12_c25_continuation_02',root/'link'))
`))
test('only exact successful upgrade/A prerequisites inherit from the unchanged overall-false attempt',()=>python(String.raw`
receipts={p:{'passed':True,'phase':p} for p in ['upgrade','prepare']};hashes={p:p*10 for p in receipts}
failure={'passed':False,'phases':copy.deepcopy(receipts),'phaseProducers':{p:{'resultSha256':hashes[p]} for p in receipts},'finalSnapshotSha256':FAILED_SNAPSHOT_SHA,'processExits':{'c25-scheduled':1},**dict.fromkeys(['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified'],True)}
original=copy.deepcopy(failure);r=inherited_phases(failure,receipts,hashes)
assert failure==original and all(v['execution']=='INHERITED_NOT_REEXECUTED' for v in r.values())
for key,value in [('passed',True),('sourceUnchanged',False),('finalSnapshotSha256','0'*64)]:
 bad=copy.deepcopy(failure);bad[key]=value;reject(lambda:inherited_phases(bad,receipts,hashes))
bad=copy.deepcopy(receipts);bad['prepare']['passed']=False;reject(lambda:inherited_phases(failure,bad,hashes))
bad=copy.deepcopy(hashes);bad['upgrade']='forged';reject(lambda:inherited_phases(failure,receipts,bad))
`))
test('complete needs five newly executed phases and both inherited prerequisites, dual protection and stopped API',()=>python(String.raw`
flags=['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified','apiStoppedAfterScheduled','failureEvidenceUnchanged','recoveryArchiveVerified','failedRowsPreserved']
r={'phases':{p:{'passed':True} for p in PHASES},'executedPhases':PHASES[:],'inheritedPhases':dict.fromkeys(['upgrade','prepare'],{}),'apiLifetime':{'stopped':True,'expired':False},**dict.fromkeys(flags,True)}
assert continuation_complete(r)
for key in flags:assert not continuation_complete({**r,key:False})
for phase in PHASES:
 bad=copy.deepcopy(r);bad['phases'][phase]['passed']=False;assert not continuation_complete(bad)
for key,value in [('executedPhases',PHASES[:-1]),('inheritedPhases',{}),('apiLifetime',{'stopped':True,'expired':True})]:assert not continuation_complete({**r,key:value})
assert PHASES==['continuation-prepare','scheduled','guards','consumers','restore']
assert PHASE_SECONDS=={'continuation-prepare':300,'scheduled':600,'guards':300,'consumers':300,'restore':600}
`))
test('actual inline wiring binds Python and helpers, protects before writers, and never clones or migrates',()=>{
 const c=continuationArgv(['--python','/absolute/python','--tools','/absolute/tools'])
 assert.equal(c.args[0],'-B');assert.equal(c.args[2],CONTINUATION_PYTHON)
 for(const args of [[],['--python','relative','--tools','/tools'],['--tools','/tools','--python','/python']])assert.throws(()=>continuationArgv(args))
 assert.ok(CONTINUATION_PYTHON.includes("'launcherPython':{'path':sys.executable"))
 assert.ok(CONTINUATION_PYTHON.includes("'inlinePythonSha256':"));assert.ok(CONTINUATION_PYTHON.includes("'archiveInlinePythonSha256':"))
 assert.ok(CONTINUATION_PYTHON.includes("'sourceInputs':preflight.source_inventory()"))
 assert.ok(!CONTINUATION_PYTHON.includes('shutil.copytree('));assert.ok(!CONTINUATION_PYTHON.includes("'--phase','upgrade'"))
 assert.ok(CONTINUATION_PYTHON.indexOf("audit('baseline','c25-continuation-audit-baseline')")<CONTINUATION_PYTHON.indexOf('api=start('))
 assert.ok(CONTINUATION_PYTHON.indexOf("if phase=='scheduled':stop_api_after_scheduled()")<CONTINUATION_PYTHON.indexOf("audit('preserve','c25-continuation-audit-preserve-'+phase)"))
 assert.equal((CONTINUATION_PYTHON.match(/api=start\(/g)??[]).length,1)
})
test('actual continuation finally retains API-first shutdown and PG stop on a failed final audit',()=>python(String.raw`
spec=importlib.util.spec_from_file_location('unchanged_c25_contracts',Path(${JSON.stringify(base)})/'c25-contracts.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
main=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main')
final=next(n.finalbody for n in main.body if isinstance(n,ast.Try) and n.finalbody)
finish=next(i for i,n in enumerate(final) if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='finish_database')
functions=[n for n in main.body if isinstance(n,ast.FunctionDef) and n.name in {'stop_child','terminate_api_writers'}]
events=[];handlers={};now=[2700]
class Process:
 def __init__(self,pid):self.pid=pid;self.returncode=None
 def poll(self):return self.returncode
 def wait(self,timeout):events.append(('wait',timeout));self.returncode=0
processes={name:Process(i+1) for i,name in enumerate(['postgres','api','client'])}
def signal(number,handler):handlers[number]=handler
def timer(which,seconds):assert handlers[14]==0 and (which,seconds)==(0,0)
lifetime=c.ApiLifetime(lambda:0,lambda _:None,lambda:None);lifetime.start()
scope={'signal':SimpleNamespace(SIGALRM=14,SIG_IGN=0,SIGINT=2,SIGTERM=15,SIGHUP=1,SIGKILL=9,ITIMER_REAL=0,signal=signal,setitimer=timer),'time':SimpleNamespace(monotonic=lambda:now[0]),'os':SimpleNamespace(killpg=lambda *args:None),'result':{'passed':False},'children':[(n,p,False) for n,p in processes.items()],'cleanup':[],'expected_stopped':set(),'api_lifetime':lifetime,'preflight':c,'subprocess':c.subprocess,'resources':lambda *_:None,'state':Path('/synthetic-absent-inventory')}
exec(compile(ast.Module(body=functions,type_ignores=[]),'<actual-stop>','exec'),scope)
real=scope['stop_child']
def stop(n,p):events.append(('stop',n));real(n,p)
scope['stop_child']=stop
exec(compile(ast.Module(body=final[:finish+1],type_ignores=[]),'<actual-finally>','exec'),scope)
assert [x[1] for x in events if x[0]=='stop']==['api','client','postgres']
assert all(p.poll() is not None for p in processes.values())
assert all(x[1]==25 for x in events if x[0]=='wait')
assert not scope['result']['passed'] and not scope['result']['finalSnapshotVerified']
assert scope['result']['apiLifetimeExpired'] and lifetime.expired and lifetime.stopped
`))
