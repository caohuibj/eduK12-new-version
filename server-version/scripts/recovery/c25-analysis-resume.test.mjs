/** New supplement coordinator contracts; original service/guard suites are not rerun. */
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import {spawnSync} from 'node:child_process'
import {ANALYSIS_PYTHON,MATERIAL_PYTHON,analysisArgv} from './c25-analysis-resume.mjs'
function python(body){
 const setup=String.raw`
import ast,copy,tempfile,os
from pathlib import Path
from types import SimpleNamespace
tree=ast.parse(SOURCE)
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in {'analysis_budget','analysis_destination','analysis_complete'}]
nodes += [n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in {'PHASES','PHASE_SECONDS','CORE_RECEIPT_SHA','CORE_SNAPSHOT_SHA'} for t in n.targets)]
preflight=SimpleNamespace(RESERVE=512*1024**2,MEMORY=2*1024**3);FLOOR=8*1024**3
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-analysis-coordinator>','exec'))
def reject(fn):
 try:fn()
 except AssertionError:return
 raise AssertionError('invalid new supplement contract accepted')
`
 const r=spawnSync(process.env.C25_TEST_PYTHON??'python3',['-B','-c',setup.replace('SOURCE',JSON.stringify(ANALYSIS_PYTHON))+'\n'+body],{encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024});assert.ifError(r.error);assert.equal(r.status,0,r.stderr||r.stdout)
}
test('remaining-only entry fixes historical6667 identity and a different fresh state and fresh direct-child destination with unchanged floors',()=>python(String.raw`
assert CORE_RECEIPT_SHA=='94949c13018705e3413f9cffa3aa810fc1d0720f173363f60cd16dffa96d76ba'
assert CORE_SNAPSHOT_SHA=='2116f582580ab67d0c5f69330d73300b026a3eaeeacf94a47f268aa16b244e85'
assert PHASES==['analysis-resume'] and PHASE_SECONDS=={'analysis-resume':300}
with tempfile.TemporaryDirectory() as d:
 root=Path(d);target=root/'eduk12_c25_analysis_02';assert analysis_destination(target,root)==target
 for name in ['eduk12_c25_continuation_02','eduk12_c25_http_01','eduk12_c25_analysis_01','sub/eduk12_c25_analysis_02']:reject(lambda:analysis_destination(root/name,root))
 target.mkdir();reject(lambda:analysis_destination(target,root))
assert analysis_budget(FLOOR+preflight.RESERVE,preflight.MEMORY,preflight.RESERVE)['cloneBytes']==0
for values in [(FLOOR+preflight.RESERVE-1,preflight.MEMORY,preflight.RESERVE),(FLOOR+preflight.RESERVE,preflight.MEMORY-1,preflight.RESERVE),(FLOOR+preflight.RESERVE,preflight.MEMORY,preflight.RESERVE-1)]:reject(lambda:analysis_budget(*values))
`))
test('completion rejects repeated FINAL/drain or old failure promotion and consumes both strict baselines',()=>python(String.raw`
flags=['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified','apiStoppedAfterAnalysis','failureEvidenceUnchanged','priorContinuationEvidenceUnchanged','coreEvidenceUnchanged','recoveryArchiveVerified','allPriorRowsPreserved','oldMaterialFilesPreserved']
e={'publications':2,'attempts':3,'finals':4,'acceptedSnapshots':4,'noCheckpointCreated':True,'originalScaleUnchanged':True,'newAcceptedFactsUnchangedAcrossConsumers':True,'suppression':{'state':'suppressed'},'export':{'proof':{'rowCount':4,'columnCount':24,'pairedValidN':1,'measuredValues':{'MA':1,'MB':0},'missingReasons':{'SA':'NOT_ASSIGNED','SB':'NO_OBSERVATION'}}}}
r={'phases':{'analysis-resume':{'phase':'analysis-resume','passed':True,'analysisSupplement':e,'executed':{'attemptsCreatedThisRun':0,'finalsSubmittedThisRun':0,'coursesCreatedThisRun':0,'publicationsCreatedThisRun':0,'reportDrainInvocations':1,'reportJobsDrainedThisRun':3,'exportsEnqueuedThisRun':1}}},'executedPhases':['analysis-resume'],'inheritedCore':{'sourceRows':6667,'sourceCheckpoints':21,'accepted':{'inheritedRestoreRows':6667}},'newDatabaseRestoreExecuted':False,'inheritedAnalysisFailure':{'failedReceiptPassed':False,'failedFinalSnapshotVerified':False},'apiLifetime':{'stopped':True,'expired':False},'protectedCoreFacts':{'allCoreRowsRetained':True,'oldRows':6667,'checkpointRows':21,'allPartialRowsRetained':True,'originalReportsBudgetRestoredExactly':True,'nonlistedColumnsExact':True,'acceptedUnitSnapshotsExact':4},'processExits':{'owned':0},**dict.fromkeys(flags,True)}
assert analysis_complete(r)
for key in flags:assert not analysis_complete({**r,key:False})
for mutate in [lambda v:v['phases']['analysis-resume']['executed'].update(finalsSubmittedThisRun=1),lambda v:v['phases']['analysis-resume']['executed'].update(reportDrainInvocations=2),lambda v:v['inheritedAnalysisFailure'].update(failedReceiptPassed=True),lambda v:v['inheritedAnalysisFailure'].update(failedFinalSnapshotVerified=True),lambda v:v['protectedCoreFacts'].update(originalReportsBudgetRestoredExactly=False),lambda v:v['protectedCoreFacts'].update(allPartialRowsRetained=False),lambda v:v['phases']['analysis-resume'].update(passed=False),lambda v:v.update(executedPhases=[]),lambda v:v.update(newDatabaseRestoreExecuted=True),lambda v:v['inheritedCore']['accepted'].update(inheritedRestoreRows=0),lambda v:v['protectedCoreFacts'].update(oldRows=6651),lambda v:v['apiLifetime'].update(expired=True),lambda v:v['processExits'].update(owned=False),lambda v:v['phases']['analysis-resume']['analysisSupplement'].update(finals=5),lambda v:v['phases']['analysis-resume']['analysisSupplement']['suppression'].update(state='not_comparable'),lambda v:v['phases']['analysis-resume']['analysisSupplement']['export']['proof']['measuredValues'].update(MB=None),lambda v:v['phases']['analysis-resume']['analysisSupplement']['export']['proof']['missingReasons'].update(SB='NOT_ASSIGNED')]:
 bad=copy.deepcopy(r);mutate(bad);assert not analysis_complete(bad)
`))
