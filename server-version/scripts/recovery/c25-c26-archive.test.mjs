/** Current recovery composition only; no archive/service or SQL is executed. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'
import {pythonProgram,parseArchiveArgs} from './c25-c26-archive.mjs'
function python(body){
 const code="import json,sys\nfrom unittest import mock\np=json.load(sys.stdin)\nscope={'__name__':'archive_test'}\nwith mock.patch('subprocess.Popen',side_effect=AssertionError('no spawn')):exec(compile(p['source'],'<archive>','exec'),scope)\nexec(compile(p['body'],'<new-contract>','exec'),scope)"
 const r=spawnSync(process.env.C25_TEST_PYTHON,['-B','-c',code],{input:JSON.stringify({source:pythonProgram,body}),encoding:'utf8',timeout:15000,maxBuffer:1024**2,env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}});assert.ifError(r.error);assert.equal(r.status,0,r.stderr||r.stdout)
}
test('current recovery binds actual accepted primary, historical restored source proof and the C21 seed',()=>python(String.raw`
import copy
current=validate_current()
assert current['logicalCountsObservedDuringArchive'] is False
assert current['precedingFailedA01']['sha256']==FAILED_A01_RECEIPT_SHA
assert current['precedingFailedA02']['sha256']==FAILED_A02_RECEIPT_SHA
assert current['precedingFailedA03']['sha256']==FAILED_A03_RECEIPT_SHA
assert FAILED_A03 in HISTORICAL_ROOTS and FROZEN_A03.parent in HISTORICAL_ROOTS and Path('/tmp/c25-c26-recovery-03') in HISTORICAL_ROOTS
assert all(Path('/tmp/'+p) in HISTORICAL_ROOTS for p in ['c25-source-11','c25-source-issuance-11','c25-c26-archive-launch-03','c25-c26-runtime-launch-03'])
assert FAILED_A02 in HISTORICAL_ROOTS and FROZEN_A02.parent in HISTORICAL_ROOTS and Path('/tmp/c25-c26-recovery-02') in HISTORICAL_ROOTS
assert FAILED_A01 in HISTORICAL_ROOTS and FROZEN_A01.parent in HISTORICAL_ROOTS and Path('/tmp/c25-c26-recovery-01') in HISTORICAL_ROOTS
assert current['acceptedRestoreReceipt']['sha256']==RESTORE_RECEIPT_SHA
assert current['seedFixture']['sha256']==SEED_FIXTURE_SHA
assert current['jointSnapshotIdentity']=='PRE_RESTORE_SOURCE; EXACT_73_ORDINAL_3_PARSER_ADMISSION_REQUIRED'
receipt=json.loads((FINAL/'c25-analysis-resume-overall-result.json').read_text())
snapshots={name:json.loads(Path(value['path']).read_text()) for name,value in SNAPSHOTS.items()}
for key,value in [('passed',False),('finalSnapshotVerified',False),('newDatabaseRestoreExecuted',True),('finalSnapshotSha256','0'*64)]:
    bad=copy.deepcopy(receipt);bad[key]=value
    try:accepted_current_facts(bad,snapshots)
    except AssertionError:pass
    else:raise AssertionError('invented accepted state admitted')
for name in SNAPSHOTS:
    bad=copy.deepcopy(snapshots);bad[name]['projection']['training_attempt_checkpoints']['rows']+=1
    try:accepted_current_facts(receipt,bad)
    except AssertionError:pass
    else:raise AssertionError('wrong accepted logical inventory admitted')
assert FINAL in HISTORICAL_ROOTS and Path('/tmp/c25-source-08') in HISTORICAL_ROOTS and R['OUTPUT'] in HISTORICAL_ROOTS
assert 'EXACT' not in restore_instructions() or '73' in restore_instructions()
assert '73-ordinal/3-parser proof' in restore_instructions()
`))
test('C26 archive output cannot reuse any older recovery path and preserves original guard',()=>{
 const value={python:'/usr/bin/python3',tools:'/tools',output:'/tmp/c25-c26-recovery-04',descriptor:'/tmp/c25-source-12/descriptor.json','expected-head':'a'.repeat(40),'expected-descriptor-sha256':'b'.repeat(64)},args=o=>Object.entries(o).flatMap(([k,v])=>['--'+k,v]);assert.deepEqual(parseArchiveArgs(args(value)),value)
 for(const output of ['/tmp/c25-c26-recovery-03','/tmp/c25-c26-recovery-02','/tmp/c25-c26-recovery-01','/tmp/c25-analysis-resume-recovery-01','/tmp/c25-missing-recovery-01','/tmp/c25-c26-recovery-01/child'])assert.throws(()=>parseArchiveArgs(args({...value,output})))
 python("assert OUTPUT==Path('/tmp/c25-c26-recovery-04')\nassert A['FLOOR']==8*1024**3 and A['RESERVE']==512*1024**2\nassert list(DATA_DIRS)==['pgdata','uploads','exports']")
})
test('A04 recovery rejects drift from the exact frozen A03 physical tree before mkdir or tar',()=>python(String.raw`
import copy,tempfile
from unittest import mock
full=json.loads(FROZEN_A03.read_text());binding=assert_frozen_a03(full)
assert binding['sha256']==FROZEN_A03_SHA and failed_a03_binding()['sha256']==FAILED_A03_RECEIPT_SHA
class Guard:
    minimum={}
    error=None
    def start(self):pass
    def stop(self):pass
    def check(self):return {'workspaceFreeBytes':A['FLOOR']+A['RESERVE'],'tmpFreeBytes':2*1024**3,'memAvailableBytes':3*1024**3}
class Source:
    def validate_descriptor(self,*args):pass
for mutation in ['metadata','missing','older-A01','older-A02']:
    drift=copy.deepcopy(full)
    if mutation=='metadata':drift[0]['mtimeNs']+=1
    elif mutation=='missing':drift.pop()
    elif mutation=='older-A01':drift=json.loads(FROZEN_A01.read_text())
    else:drift=json.loads(FROZEN_A02.read_text())
    with tempfile.TemporaryDirectory() as tmp:
        output=Path(tmp)/'new-recovery';tools=ROOT/'eduk12_tools_20261018';calls=[]
        argv=['archive','--tools',str(tools),'--output',str(output),'--descriptor',str(FROZEN_A03),
              '--expected-head','a'*40,'--expected-descriptor-sha256','b'*64,'--expected-producer-sha256',sha_file(PRODUCER),
              '--expected-inline-sha256','c'*64,'--expected-python-sha256',sha_file(Path(sys.executable).resolve())]
        def blocked(*args,**kwargs):calls.append('unexpected-subprocess');raise AssertionError('no archive or service may start')
        with mock.patch.object(sys,'argv',argv),mock.patch('fcntl.flock'),mock.patch('subprocess.Popen',side_effect=blocked),mock.patch.dict(A,helpers=lambda:(Source(),None)),mock.patch.dict(main.__globals__,output_path=lambda *_:output,ResourceGuard=Guard,producer_binding=lambda *_:{'inlinePythonSha256':'c'*64},stopped_current=lambda *_:{},frozen_failure_manifest=lambda *_:drift,data_manifests=lambda *_:{'same':True},data_projection=lambda *_:{'same':True}):
            try:main()
            except AssertionError as e:assert str(e)=='current tree differs from frozen stopped A03 physical state'
            else:raise AssertionError('drift was accepted')
        assert not output.exists() and calls==[]
`))

test('A04 inherited A03 fact is SQL-ready but no successful baseline or driver',()=>python(String.raw`
import copy
from unittest import mock
binding=failed_a03_binding();actual=json.loads(Path(binding['path']).read_text())
assert actual['processExits']['c25-c26-readiness-1']==0 and actual['processExits']['c25-c26-audit-baseline']==-9
for key,value in [('passed',True),('finalSnapshotVerified',True),('driverExecuted',True),('audits',{'baseline':{'passed':True}}),('processExits',{**actual['processExits'],'c25-c26-audit-baseline':0})]:
    changed=copy.deepcopy(actual);changed[key]=value
    with mock.patch('json.loads',return_value=changed):
        try:failed_a03_binding()
        except AssertionError:pass
        else:raise AssertionError('unobserved logical or business qualification admitted')
assert 'No logical preservation is inferred from A01-A03.' in restore_instructions()
`))
