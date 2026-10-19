/** Only the newly composed coordinator contracts; no launch, archive or DB. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'
import {MISSING_PYTHON,missingArgv} from './c25-missing.mjs'
function python(body){const setup=String.raw`
import ast,copy,tempfile,os,re
from pathlib import Path
from types import SimpleNamespace
tree=ast.parse(SOURCE)
names={'missing_budget','missing_destination','missing_complete'}
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
nodes += [n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in {'PHASES','PHASE_SECONDS','FAILED_RECEIPT_SHA','FAILED_SNAPSHOT_SHA'} for t in n.targets)]
preflight=SimpleNamespace(RESERVE=512*1024**2,MEMORY=2*1024**3);FLOOR=8*1024**3
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-missing-coordinator>','exec'))
def reject(fn):
 try:fn()
 except AssertionError:return
 raise AssertionError('invalid missing-only contract accepted')
`;const r=spawnSync(process.env.C25_TEST_PYTHON??'python3',['-B','-c',setup.replace('SOURCE',JSON.stringify(MISSING_PYTHON))+'\n'+body],{encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024});assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr||r.stdout)}
test('missing-only identity fixes the third snapshot and one new directory without reducing entry guards',()=>python(String.raw`
assert FAILED_RECEIPT_SHA=='16293c2c79b377c36fe665e260d8f45c43941df89d003e7be993925905a50f08'
assert FAILED_SNAPSHOT_SHA=='cae493b8a6d6c62a34a9d181822d22cd927fa5c1081666cd8fb049cefa91d1cf'
with tempfile.TemporaryDirectory() as d:
 root=Path(d);target=root/'eduk12_c25_continuation_02'
 assert missing_destination(target,root)==target
 for name in ['eduk12_c25_continuation_01','eduk12_c25_http_01','eduk12_c25_continuation_03','sub/eduk12_c25_continuation_02']:reject(lambda:missing_destination(root/name,root))
 target.mkdir();reject(lambda:missing_destination(target,root))
assert missing_budget(FLOOR+preflight.RESERVE,preflight.MEMORY,preflight.RESERVE)['cloneBytes']==0
reject(lambda:missing_budget(FLOOR+preflight.RESERVE-1,preflight.MEMORY,preflight.RESERVE))
`))
test('new composition requires every actual missing phase, distinct inherited subchecks and all three protection layers',()=>python(String.raw`
assert PHASES==['missing-open','missing-probe','missing-consumers','missing-guards','missing-restore']
assert PHASE_SECONDS==dict(zip(PHASES,[180,600,60,120,600]))
flags=['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified','apiStoppedAfterProbe','failureEvidenceUnchanged','priorContinuationEvidenceUnchanged','recoveryArchiveVerified','allPriorRowsPreserved']
r={'phases':{p:{'phase':p,'passed':True} for p in PHASES},'executedPhases':PHASES[:],'inheritedSubchecks':{'scope':'C25_MISSING_ONLY_EXPLICIT_INHERITED_SUBCHECKS_NOT_PRIOR_PHASE_PASS','preservedFalseReceipts':[{},{}]},'apiLifetime':{'stopped':True,'expired':False},**dict.fromkeys(flags,True)}
assert missing_complete(r)
for key in flags:assert not missing_complete({**r,key:False})
for mutate in [lambda x:x['phases']['missing-probe'].update(passed=False),lambda x:x['phases']['missing-probe'].update(phase='scheduled'),lambda x:x['executedPhases'].pop(),lambda x:x['inheritedSubchecks'].update(scope='old scheduled passed'),lambda x:x['inheritedSubchecks']['preservedFalseReceipts'].pop(),lambda x:x['apiLifetime'].update(expired=True)]:
 bad=copy.deepcopy(r);mutate(bad);assert not missing_complete(bad)
`))
test('actual composed wiring never reruns prepare/migration and stops API before all audits after E',()=>{
 const command=missingArgv(['--python','/absolute/python','--tools','/absolute/tools']);assert.equal(command.args[2],MISSING_PYTHON)
 assert.ok(!MISSING_PYTHON.includes('shutil.copytree('));assert.ok(!MISSING_PYTHON.includes("'--phase','upgrade'"));assert.ok(!MISSING_PYTHON.includes("'c25-scheduled.mjs'"))
 assert.ok(MISSING_PYTHON.includes("archive_file=BASE/'c25-missing-archive.mjs'"));assert.ok(MISSING_PYTHON.includes("'launcherPython':{'path':sys.executable"))
 assert.ok(MISSING_PYTHON.includes("'--node',node,'--db-helper',BASE/'c25-db.py','--contract',BASE/'c25-missing-contract.mjs'"))
 assert.ok(MISSING_PYTHON.indexOf("audit('baseline','c25-missing-audit-baseline')")<MISSING_PYTHON.indexOf('api=start('))
 assert.ok(MISSING_PYTHON.indexOf("if phase=='missing-probe':stop_api_after_probe()")<MISSING_PYTHON.indexOf("audit('preserve','c25-missing-audit-preserve-'+phase)"))
 assert.equal((MISSING_PYTHON.match(/api=start\(/g)??[]).length,1);assert.ok(MISSING_PYTHON.includes("assert phase=='missing-open','no API restart"))
 assert.ok(MISSING_PYTHON.includes("assert archive['inventory'](prior)==prior_evidence"));assert.ok(MISSING_PYTHON.includes("if mode=='final':"));assert.ok(MISSING_PYTHON.includes("result['allPriorRowsPreserved']=True"))
 const cleanup=MISSING_PYTHON.slice(MISSING_PYTHON.indexOf(' finally:\n  # The run deadline'))
 assert.ok(cleanup.indexOf('signal.signal(signal.SIGALRM,signal.SIG_IGN)')<cleanup.indexOf("if name=='api':stop_child"))
 assert.ok(cleanup.indexOf("if name=='api':stop_child")<cleanup.indexOf('preflight.finish_database(final_audit,stop_postgres,result)'))
})
