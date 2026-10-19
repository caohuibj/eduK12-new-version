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
 const value={python:'/usr/bin/python3',tools:'/tools',output:'/tmp/c25-c26-recovery-01',descriptor:'/tmp/c25-source-09/descriptor.json','expected-head':'a'.repeat(40),'expected-descriptor-sha256':'b'.repeat(64)},args=o=>Object.entries(o).flatMap(([k,v])=>['--'+k,v]);assert.deepEqual(parseArchiveArgs(args(value)),value)
 for(const output of ['/tmp/c25-analysis-resume-recovery-01','/tmp/c25-missing-recovery-01','/tmp/c25-c26-recovery-01/child'])assert.throws(()=>parseArchiveArgs(args({...value,output})))
 python("assert OUTPUT==Path('/tmp/c25-c26-recovery-01')\nassert A['FLOOR']==8*1024**3 and A['RESERVE']==512*1024**2\nassert list(DATA_DIRS)==['pgdata','uploads','exports']")
})
