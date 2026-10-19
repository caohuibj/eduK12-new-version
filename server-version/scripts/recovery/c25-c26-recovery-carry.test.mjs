/** Pure contracts using frozen JSON evidence. No services, archive, extraction,
 * descriptor issuance or producer execution. No original Python bytes change. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {pythonProgram,invocation} from './c25-c26-recovery-carry.mjs'
const python=body=>{
 const code="import json,sys\nfrom unittest import mock\np=json.load(sys.stdin)\ns={'__name__':'carry_contract'}\nwith mock.patch('subprocess.Popen',side_effect=AssertionError('no subprocess')):exec(compile(p['source'],'<carry>','exec'),s)\nexec(compile(p['body'],'<contract>','exec'),s)"
 const r=spawnSync(process.env.C25_TEST_PYTHON,['-B','-c',code],{input:JSON.stringify({source:pythonProgram,body}),encoding:'utf8',timeout:15000,maxBuffer:1024**2,env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}});assert.ifError(r.error);assert.equal(r.status,0,r.stderr||r.stdout)
}
test('carry matches all 45 direct recovery05-to-A06 exact old/new objects and rejects numeric relations, config, materials or metadata drift',()=>python(String.raw`
import copy
before=json.loads((OUTPUT/NAMES['fullSourceManifest']).read_text());after=json.loads(CURRENT_FULL.read_text())
assert sha_file(CURRENT_FULL)==PINNED[str(CURRENT_FULL)]
proof=exact_physical_delta(before,after);assert proof['count']==45 and proof['allOtherObjectsEqual'] is True
for where,field in [('pgdata/base/16384/2600','sha256'),('pgdata/postgresql.conf','sha256'),('pgdata/pg_xact/0000','sha256'),('exports','mode'),('pgdata/global/pg_control','mtimeNs')]:
    bad=copy.deepcopy(after)
    candidates=[r for r in bad if r['path']==where]
    if not candidates and where=='pgdata/base/16384/2600':candidates=[r for r in bad if r['path'].startswith('pgdata/base/16384/') and r['path'].rsplit('/',1)[1].isdigit()]
    assert candidates,where
    target=candidates[0];target[field]='0'*64 if field=='sha256' else target[field]+1
    try:exact_physical_delta(before,bad)
    except AssertionError:pass
    else:raise AssertionError('non-equivalent physical state accepted')
for bad in [after[:-1],after+[copy.deepcopy(after[-1])],before]:
    try:exact_physical_delta(before,bad)
    except AssertionError:pass
    else:raise AssertionError('missing/duplicate/old-current state accepted')
assert not CARRY_OUTPUT.exists()
`))
test('carry uses actual A05 logical preservation while keeping overall and final qualification false',()=>python(String.raw`
import copy
load=lambda n:json.loads((A05/n).read_text())
base,final,overall,driver=[load(n) for n in ['c25-c26-audit-baseline-result.json','c25-c26-audit-final-result.json','c25-c26-a-overall-result.json','c25-c26-a-driver-result-private.json']]
diag=json.loads((A05_DIAGNOSTIC/'receipt.json').read_text());facts=logical_facts(base,final,overall,driver,diag)
assert facts['oldRowProtectionPassed'] is True and facts['originalOverallPassed'] is False and facts['originalFinalAuditPassed'] is False and facts['businessWritesObserved']==0
for change in ['business','prisma','rows','schema','budget','missing-baseline','final-green','overall-green','new-attempt']:
    values=copy.deepcopy([base,final,overall,driver,diag]);b,f,o,d,x=values
    if change=='business':d['http']=[{'method':'POST'}]
    elif change=='prisma':d['prismaBusiness']={'issued':1}
    elif change=='rows':f['protectedCoreFacts']['addedRowsByTable']={'users':1}
    elif change=='schema':f['currentSnapshotFile']['sha256']='0'*64
    elif change=='budget':f['protectedCoreFacts']['originalReportsSingletonExact']=False
    elif change=='missing-baseline':b['passed']=False
    elif change=='final-green':f['passed']=True
    elif change=='overall-green':o['passed']=True
    else:x['newAttempts']=1
    try:logical_facts(*values)
    except AssertionError:pass
    else:raise AssertionError('unsupported logical equivalence admitted')
`))
test('carry consumer requires explicit kind, current producer HEAD and whole historical rollback semantics',()=>python(String.raw`
import copy
head='a'*40;producer={'head':head,'closure':'current'};contract={'files':{'dataManifest':{'path':'historical05'}}}
value={'schemaVersion':1,'kind':CARRY_KIND,'scope':CARRY_SCOPE,'head':head,'producer':producer,'contract':contract,'files':contract['files'],'sourceRoot':str(SOURCE),'archiveBytesEqualCurrentPhysicalState':False,'logicalRollbackEquivalent':True,'newArchiveCreated':False,'newRoundTripExecuted':False,'durableBackup':False,'servicesStarted':False,'restorePolicy':'RESTORE_WHOLE_RECOVERY05_PGDATA_UPLOADS_EXPORTS; NEVER_MIX_CURRENT_WAL','passed':True}
validate_carry_envelope(value,head,producer,contract)
for key,bad_value in [('kind','PHYSICALLY_IDENTICAL'),('head','b'*40),('producer',{'head':'b'*40}),('contract',{}),('archiveBytesEqualCurrentPhysicalState',True),('newRoundTripExecuted',True),('restorePolicy','MIX_CURRENT_WAL'),('passed',False)]:
    bad=copy.deepcopy(value);bad[key]=bad_value
    try:validate_carry_envelope(bad,head,producer,contract)
    except (AssertionError,KeyError):pass
    else:raise AssertionError('forged carry identity accepted')
assert OUTPUT==Path('/tmp/c25-c26-recovery-05') and CARRY_OUTPUT==Path('/tmp/c25-c26-carry-07')
assert PRODUCER==BASE/'c25-c26-recovery-carry.mjs' and callable(verify_recovery_descriptor)
`))
test('carry checks current full before startup and still checks both A05 and A06 history in final immutable verification',()=>python(String.raw`
from unittest import mock
old=json.loads(OLD_DESCRIPTOR.read_text());current=json.loads(CURRENT_FULL.read_text());calls=[]
def historical():calls.append('historical05');return old,{'old':True}
def accepted():calls.append('A05-evidence');return {'accepted':True}
patches={'historical_rollback':historical,'accepted_a05_evidence':accepted,'accepted_a06_evidence':lambda:calls.append('A06-evidence') or {'accepted':True},'stopped_current':lambda *_:calls.append('stopped'),'stopped_a05':lambda *_:calls.append('stopped-a05'),'stopped_a06':lambda *_:calls.append('stopped-a06')}
with mock.patch.dict(current_contract.__globals__,patches),mock.patch.dict(current_contract.__globals__,frozen_failure_manifest=lambda *_:current):
    before=current_contract(ROOT/'eduk12_tools_20261018',True)
    assert calls==['historical05','A05-evidence','A06-evidence','stopped','stopped-a05','stopped-a06'];calls.clear()
    final=current_contract(ROOT/'eduk12_tools_20261018',False)
    assert before==final and calls==['historical05','A05-evidence','A06-evidence']
with mock.patch.dict(current_contract.__globals__,patches),mock.patch.dict(current_contract.__globals__,frozen_failure_manifest=lambda *_:current[:-1]):
    try:current_contract(ROOT/'eduk12_tools_20261018',True)
    except AssertionError as e:assert str(e)=='current stopped tree differs from frozen A06'
    else:raise AssertionError('new current physical drift accepted')
assert not CARRY_OUTPUT.exists()
`))
test('carry CLI only names a fresh A07 carry output and cannot issue into historical archives',()=>{
 const values={python:process.env.C25_TEST_PYTHON,tools:'/workspace/scratch/5a77e8bdc1ae/eduk12_tools_20261018',output:'/tmp/c25-c26-carry-07',descriptor:'/tmp/c25-source-16/c25-source-descriptor.json','expected-head':'a'.repeat(40),'expected-descriptor-sha256':'b'.repeat(64)},args=x=>Object.entries(x).flatMap(([k,v])=>['--'+k,v])
 const r=invocation(args(values));assert.equal(r.python,values.python);assert.equal(r.input,pythonProgram);assert.deepEqual(r.args.slice(0,2),['-B','-'])
 for(const output of ['/tmp/c25-c26-recovery-05','/tmp/c25-c26-carry-05','/tmp/c25-c26-carry-06','/tmp/c25-c26-carry-07/nested'])assert.throws(()=>invocation(args({...values,output})))
 assert.ok(pythonProgram.includes("__name__='historical_c26_library'"));assert.ok(pythonProgram.includes("if __name__=='__main__':carry_main()"))
})
test('real Node carry CLI transports the complete oversized inline source over stdin before safe fixed-path rejection',()=>{
 const values={python:process.env.C25_TEST_PYTHON,tools:'/tools',output:'/tmp/c25-c26-carry-07',descriptor:'/tmp/c25-source-16/c25-source-descriptor.json','expected-head':'a'.repeat(40),'expected-descriptor-sha256':'b'.repeat(64)}
 const argv=Object.entries(values).flatMap(([k,v])=>['--'+k,v]),command=invocation(argv)
 assert.ok(Buffer.byteLength(pythonProgram)>128*1024)
 assert.ok(command.args.every(s=>Buffer.byteLength(s)<4096))
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./c25-c26-recovery-carry.mjs',import.meta.url)),...argv],{encoding:'utf8',timeout:15000,maxBuffer:1024**2,env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}})
 assert.ifError(result.error);assert.equal(result.status,1);assert.match(result.stderr,/Traceback/);assert.match(result.stderr,/carry_main/);assert.match(result.stderr,/AssertionError/);assert.doesNotMatch(result.stderr,/E2BIG/)
 // The same complete stdin bytes and unchanged business argument positions are
 // independently checked by real Python; executing definitions is inert.
 const verifier="import hashlib,json,sys\nraw=sys.stdin.buffer.read()\nexpected=sys.argv[sys.argv.index('--expected-inline-sha256')+1]\nassert hashlib.sha256(raw).hexdigest()==expected\nscope={'__name__':'carry_transport_contract'}\nexec(compile(raw,'<complete-carry-stdin>','exec'),scope)\nassert callable(scope['carry_main'])\nprint(json.dumps({'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'argv':sys.argv[1:]}))"
 const checked=spawnSync(command.python,['-B','-c',verifier,...command.args.slice(2)],{input:command.input,encoding:'utf8',timeout:15000,maxBuffer:1024**2,env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}})
 assert.ifError(checked.error);assert.equal(checked.status,0,checked.stderr)
 const actual=JSON.parse(checked.stdout);assert.equal(actual.sha256,createHash('sha256').update(pythonProgram).digest('hex'));assert.equal(actual.bytes,Buffer.byteLength(pythonProgram));assert.deepEqual(actual.argv,command.args.slice(2))
})


test('carry A07 binds actual uncertain authentication and post-quiescence logical equality without claiming zero HTTP writes',()=>python(String.raw`
import copy
load=lambda n:json.loads((A06/n).read_text())
base,final,overall,driver=[load(n) for n in ['c25-c26-audit-baseline-result.json','c25-c26-audit-final-result.json','c25-c26-a-overall-result.json','c25-c26-a-driver-result-private.json']]
diag=json.loads((A06_DIAGNOSTIC/'receipt.json').read_text());events=[json.loads(line) for line in (A06/'c25-c26-driver-events-private.jsonl').read_text().splitlines()]
facts=a06_logical_facts(base,final,overall,driver,diag,events)
assert facts['authenticationPostOutcome']=='UNCERTAIN' and facts['authenticationPostIssued'] is True and 'businessWritesObserved' not in facts
assert facts['fixtureCreated'] is False and facts['originalOverallPassed'] is False and facts['oldRowProtectionPassed'] is True
for change in ['changed-auth','missing-uncertain','pretend-response','fixture','attempt','final','prisma-write','rows','schema','quiet','overall']:
    values=copy.deepcopy([base,final,overall,driver,diag,events]);b,f,o,d,x,e=values
    if change=='changed-auth':next(q for q in e if q.get('stage')=='HTTP_ISSUED' and q['id']==2)['route']='/assessment/final'
    elif change=='missing-uncertain':e[:]=[q for q in e if q.get('stage')!='UNCERTAIN']
    elif change=='pretend-response':e.append({'stage':'HTTP_RECEIVED','id':2,'route':'/auth/training-login','method':'POST','status':200})
    elif change=='fixture':x['fixtureCreated']=True
    elif change=='attempt':x['newAttempts']=1
    elif change=='final':x['newFinalSubmissions']=1
    elif change=='prisma-write':next(q for q in e if q.get('stage')=='DRIVER_PRISMA_ISSUED')['action']='create'
    elif change=='rows':f['protectedCoreFacts']['addedRowsByTable']={'users':1}
    elif change=='schema':f['currentSnapshotFile']['sha256']='0'*64
    elif change=='quiet':o['stopProofs'][0]['passed']=False
    else:o['passed']=True
    try:a06_logical_facts(*values)
    except (AssertionError,KeyError):pass
    else:raise AssertionError('unsupported A06 carry accepted: '+change)
actual=accepted_a06_evidence();assert actual['facts']==facts and len(actual['priorCarryAndSourceHistoricalOnly'])==3
assert not CARRY_OUTPUT.exists() and not CURRENT_SOURCE_DESCRIPTOR.exists()
`))
