from pathlib import Path
import hashlib,json,subprocess
root=Path('/workspace/eduK12-new-version');out=Path(__file__).resolve().parent
paths=[root/'server-version/backend/src/modules/cognitive'/p for p in ['task-resource.ts','catalog.service.ts','library/product-readiness.ts','assignment.service.ts','assignment-measurement-release.ts','profile-freeze.ts','session.service.ts','public.service.ts','release.service.ts']]+[root/'server-version/backend/prisma/seeds/native-cognitive.ts',root/'server-version/backend/prisma/seeds/cognitive.ts',root/'server-version/backend/src/__tests__/cognitive/native-mot-journey.postgres.integration.test.ts',root/'server-version/backend/src/__tests__/cognitive/native-task-resource.test.ts']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
bind=lambda ps:{str(p.relative_to(root)):sha(p) for p in ps}
types=json.loads((out/'native-types-run2.check.json').read_text())
checks={}
for label in ['postgres-run1','postgres-run2-seed-and-final','resource-boundaries','native-types','native-types-run2']:
 c=json.loads((out/(label+'.check.json')).read_text());entry={k:c[k] for k in ['exitCode','elapsedSeconds','inputStable']}
 r=out/(label+'.json')
 if r.exists():
  data=json.loads(r.read_text());entry.update(passed=data['numPassedTests'],failed=data['numFailedTests'],pending=data['numPendingTests'])
 checks[label]=entry
status={'status':'READY_FOR_PARENT_REVIEW_NATIVE_MOT_LOGGED_COURSE_BACKEND',
 'observedHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
 'pr356HeadRead':'a57b6c8d1a671209b55ae5558da0964c1d4eea6f','pr356BaseBlobsCompared':11,
 'sourceSha256':bind(paths),'typesFinalOwnSourceHashesMatch':all(types['inputAfter'][str(p.relative_to(root))]==sha(p) for p in paths),
 'checks':checks,'distinctNewBusinessAndBoundaryCases':6,
 'nativeSeed':{'realEntrypoint':'prisma/seeds/native-cognitive.ts::seedNativeMotConfig','wiredIntoExisting':'prisma/seeds/cognitive.ts::seedCognitiveConfigs','nativeTypesSeeded':['mot'],'baseConfigRowsPerVersion':1,'initialStatus':'DRAFT','preservesExistingLifecycle':True,'rejectsSameVersionDivergentContent':True,'wholeDatabaseSeedExecuted':False},
 'actualBusinessFunctionsMocked':False,'testEnvironmentFileReaderMockedOnly':True,'negativeSeedGuardUsesExplicitMockDb':True,
 'realDatabase':'parent-provided disposable loopback cognitive_native_test/cognitive_native_20261026','ownFixturesCleaned':True,
 'implemented':['score-free native metadata branch','basic tests catalog','native dual-profile config readiness','explicit system-admin config release','owned teacher course assignment publication and measurement source','frozen native report tuple and bytes','authorized member UNIFIED START','real native session snapshot DTO','existing authoritative FINAL normal/invalid/replay without numeric score'],
 'notEnabled':['other3 native product delivery/seed','native public/anonymous','native composite/library wrapper delivery','Survey native templates','advanced legacy library/domain discovery and tag filtering'],
 'notVerified':['frontend HTTP/browser integrated journey','production API/DB/COS','real device physical timing','population validity','CI/build/deployment'],
 'routesControllersFinalServiceOwnedByParent':True,'schemaMigrationOrQueueChanged':False,'measurementScorerOrVersionChanged':False,
 'noFakeScoreOrStandardAlias':True,'productionCredentialsRead':False,'prismaGenerateOrDbPushExecutedByThisAgent':False,
 'developerEvidenceNotIndependentAudit':True,'committedByThisAgent':False,'pushedByThisAgent':False,
 'evidenceSha256':bind([p for p in sorted(out.iterdir()) if p.is_file() and p.name!='status.json'])}
(out/'status.json').write_text(json.dumps(status,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'statusSha256':sha(out/'status.json'),'typesFinalHashesMatch':status['typesFinalOwnSourceHashesMatch'],'checks':checks}))
