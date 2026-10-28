from pathlib import Path
import hashlib,json,subprocess
root=Path('/workspace/eduK12-new-version');out=Path(__file__).resolve().parent
front=root/'server-version/frontend/src/modules/cognitive/tasks/mot'
changed=[front/x for x in ['MotTask.tsx','context-retention.ts','MotTask.context.test.tsx']]
unchanged=[front/x for x in ['generated/protocol.ts','capture.ts','draft.ts','mot.css','MotCalibration.tsx','save-gate.ts']]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
bind=lambda paths:{str(p.relative_to(root)):sha(p) for p in paths}
base='d00fa0965245f456ff565a51d9e39f4569c13f90'
types=json.loads((out/'context-types.check.json').read_text())
checks={}
for label in ['context-run1','context-run2','context-run3-new-windows']:
 r=json.loads((out/(label+'.json')).read_text());c=json.loads((out/(label+'.check.json')).read_text())
 checks[label]={'exitCode':c['exitCode'],'durationSeconds':c['elapsedSeconds'],'passed':r['numPassedTests'],'failed':r['numFailedTests'],'pending':r['numPendingTests'],'success':r['success']}
status={'status':'READY_FOR_PARENT_INDEPENDENT_REVIEW','base':base,'scope':'MOT C-02 async host ownership and unmount retention only',
 'sourceSha256':bind(changed),'types':{'exitCode':types['exitCode'],'elapsedSeconds':types['elapsedSeconds'],'sourceHashesMatchFinal':all(types['inputAfter'][str(p.relative_to(root))]==sha(p) for p in changed),'actualConfig':'server-version/frontend/tsconfig.app.json','roots':3},
 'checks':checks,'distinctSuccessfulNewCases':12,'firstFailure':'test-fixture transform ASI error, zero cases executed; preserved',
 'versionsChanged':False,'measurementOrScorerOrFrozenDataContractChanged':False,
 'retainedContextBudget':8,'evictsUnsavedRaw':False,'captureFramesBudgetUnchanged':3000,'memoryIsDurableAcrossRefresh':False,
 'actualConsumerRead':'server-version/scripts/cognitive/mot-browser-review.cjs; stable draft, core.trialIndex-based progress; synthetic host only, not rerun',
 'unchangedSha256':bind(unchanged),'unchangedVsBase':{str(p.relative_to(root)):sha(p)==hashlib.sha256(subprocess.check_output(['git','show',base+':'+str(p.relative_to(root))],cwd=root)).hexdigest() for p in unchanged},
 'notExecuted':['C-01 tests','old persistence suite','full motion/seed/scorer or timing checks','other candidate types','browser/device','CI','install/build','API/DB/COS validation'],
 'notImplemented':['production host adapters','server epoch/exposure/idempotency authority','cross-tab ownership','COS uploads','new scientific or timing gate'],
 'committedByThisAgent':False,'pushedByThisAgent':False,'developerSelfCheckNotIndependentAudit':True,
 'evidenceSha256':bind([p for p in sorted(out.iterdir()) if p.is_file() and p.name!='status.json'])}
(out/'status.json').write_text(json.dumps(status,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'statusSha256':sha(out/'status.json'),'typesHashMatch':status['types']['sourceHashesMatchFinal'],'unchanged':all(status['unchangedVsBase'].values()),'sourceSha256':status['sourceSha256']}))
