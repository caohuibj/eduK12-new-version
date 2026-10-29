"""Bind this documentation handoff; does not run tests, policy, scorer or browser."""
from pathlib import Path
import hashlib,json,subprocess
root=Path('/workspace/eduK12-new-version'); out=Path(__file__).resolve().parent
backend=root/'server-version/backend/src/modules/cognitive/content-candidates/enumeration'
frontend=root/'server-version/frontend/src/modules/cognitive/tasks/enumeration'
source=list(backend.glob('*.ts'))+list(frontend.rglob('*.ts'))+list(frontend.glob('*.tsx'))+[root/'server-version/backend/src/__tests__/cognitive/enumeration-candidate.test.ts',root/'server-version/scripts/cognitive/enumeration-content.cjs']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def bindings(paths):return {str(p.relative_to(root)):sha(p) for p in sorted(paths)}
unchanged=[frontend/x for x in ['capture.ts','display.ts','persistence.ts','enumeration.css']]+[root/'docs/cognitive-library/next-candidates-20261026/enumeration/implementation/frontend/browser-captured-raw.json']
checks={}
for name in ['backend-affected','backend-metadata-final','backend-stored-adapter','frontend-report','frontend-stored-adapter','projection-final','projection-stored-final']:
 d=json.loads((out/(name+'.check.json')).read_text());r=out/(name+'.json')
 checks[name]={'exitCode':d['exitCode'],'elapsedSeconds':d['elapsedSeconds'],'inputStable':d['inputStable']}
 if r.exists():
  result=json.loads(r.read_text());checks[name].update(passed=result['numPassedTests'],failed=result['numFailedTests'],pending=result['numPendingTests'])
status={'candidateId':'attention-enumeration-flower','status':'READY_FOR_PARENT_REVIEW_NOT_REGISTERED',
 'base':'86adea091270134b5197fb81b76649007596b8f3',
 'authorization':{'notion':'https://app.notion.com/p/405d27635a3881b2a2d3fecce26d7cb3','effectiveUtc':'2026-10-26T09:20:00Z','actuallyRead':True,'productFeedbackAllowed':True,'strictTimingPolicyImplemented':False},
 'versions':{'engineVersion':'0.1.0','scoringVersion':'0.2.0','configVersion':'0.2.0','metricDefinitionVersion':'0.2.0','qualityDefinitionVersion':'0.2.0','reportDefinitionVersion':'0.2.0','presentationVersion':'0.1.0','protocolKey':'enumeration/0.1.0/0.1.0','protocolVersion':'0.1.0','referenceBindings':[]},
 'checks':checks,'uniqueSelectedBackendCases':12,'uniqueSelectedFrontendCases':8,
 'evidenceReuse':'backend-affected metadata assertion replaced by backend-metadata-final; other numeric scorer inputs unchanged. Existing UI7 unchanged by independent stored branch; added stored test1 only. No signed or CI evidence claimed.',
 'sourceSha256':bindings(source),'unchangedSha256':bindings(unchanged),
 'supportingReadInputsSha256':bindings([root/'AGENTS.md',root/'docs/release/README.md',root/'server-version/backend/src/modules/cognitive/v2/result-snapshot.ts',root/'server-version/backend/src/modules/cognitive/v2/types.ts']),
 'unchangedVsBase':{str(p.relative_to(root)):sha(p)==hashlib.sha256(subprocess.check_output(['git','show','86adea091270134b5197fb81b76649007596b8f3:'+str(p.relative_to(root))],cwd=root)).hexdigest() for p in unchanged},
 'immediateResultRequiresScorerAudit':True,'storedSnapshotAdapterManufacturesAudit':False,
 'types':{'executionOwner':'parent','status':'PENDING_PARENT_UNIFIED_ACTUAL_TSCONFIG_CLOSURE','notRepeatedByChild':True},
 'notRun':['old seed/capture cases','old 3+25 component session','browser or timing rerun','old raw rescoring','strict timing policy','CI','full build','install'],
 'notConnected':['native registration','formal entrypoints','production host identity and authority','API FINAL','DB frozen storage','COS archive and export'],
 'limitations':['developer self-check not independent audit','synthetic report fixtures not device evidence','no physical timing or population validity claim','host must authorize and supply actual frozen result','old frozen results remain unchanged; old replay needs old definition'],
 'committedByThisAgent':False,'pushedByThisAgent':False,
 'documentationSha256':bindings([p for p in out.iterdir() if p.is_file() and p.name!='status.json'])}
(out/'status.json').write_text(json.dumps(status,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'statusSha256':sha(out/'status.json'),'rawUnchanged':all(status['unchangedVsBase'].values()),'checks':checks},ensure_ascii=False))
