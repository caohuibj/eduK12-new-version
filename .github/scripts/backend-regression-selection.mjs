import assert from 'node:assert/strict';
import {globSync,writeFileSync} from 'node:fs';
import {matchesGlob,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const regressionGroups=['fixtures','shard-1','shard-2','shard-3','shard-4','shard-5','shard-6'];
export const backendOwnedFile='src/__tests__/questionnaire/aggregate-report.postgres.integration.test.ts';
// Keep retained file/row consumers with their producers, including opt-in manual
// continuations. Scheduling never enables those opt-ins or copies mutable DBs.
const fixturePatterns=[
  'assessment-authorization/**', // precise checkpoints and retained actor/policy prefixes
  'integration/trainingBundle*','integration/trainingStandalone*','integration/trainingLegacyScaleStart*',
  'integration/teacherSelfGroup*','integration/librarySelfGroup*','integration/teacherPrivateComposition*',
  'integration/teacherNativeGroup*','integration/teacherNumeric*','integration/teacherGroupTransaction*',
  'integration/teacherFormGroup*','integration/teacherPersonalLongitudinal*',
  'integration/schoolPrivateGroupSource*','integration/schoolSelfGroup*','integration/schoolPersonalLongitudinal*',
  'integration/groupReportSchool*','integration/educationNativeLongitudinal*','integration/educationLongitudinalLeafs*',
  'integration/trainingPersonalTracking*',
  'measurement-content/runtime-connected*','measurement-content/formal-reference-connected*',
  'measurement-content/private-reference-expiry*','measurement-content/training-receipt-recovery*',
  'measurement-content/source-authority-races*','measurement-content/dot356-standard-vertical*',
  'measurement-content/training-standard-connected*',
  'survey/catalog-instruction*','survey/standard-approval-scope*','survey/onboarding-pagination*',
  'scale/pr356-entry-*','scale/bibliography-axis*','composite/pr356-*',
  'bundle-onboarding/education-native*','bundle-onboarding/teacher-jdr-*',
  'bundle-onboarding/survey-native.postgres*','bundle-onboarding/schema3-native-final*',
  'bundle-product/education-package-continuation*','assessment-runtime/compact-assessment-storage*',
];

export function partitionRegressionFiles(files,excluded){
  assert.equal(new Set(files).size,files.length,'Duplicate discovered regression file');
  assert.equal(new Set(excluded).size,excluded.length,'Duplicate explicit exclusion');
  assert.ok(excluded.includes(backendOwnedFile),'The backend job retains its hardware-sensitive suite');
  const all=new Set(files);
  for(const file of excluded)assert.ok(all.has(file),`Unknown regression exclusion: ${file}`);
  const excludedSet=new Set(excluded),groups=Object.fromEntries(regressionGroups.map(group=>[group,[]]));
  let shard=0;
  for(const file of [...files].sort()){
    assert.ok(file.startsWith('src/__tests__/')&&file.endsWith('.test.ts'),`Unexpected test path: ${file}`);
    if(excludedSet.has(file))continue;
    const retained=fixturePatterns.some(pattern=>matchesGlob(file.slice('src/__tests__/'.length),pattern));
    groups[retained?'fixtures':`shard-${shard++%6+1}`].push(file);
  }
  const special=excluded.filter(file=>file!==backendOwnedFile);
  return {groups,special,expectedFiles:[...files].filter(file=>file!==backendOwnedFile).sort()};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [group,report,inventory,...args]=process.argv.slice(2);
  assert.ok(regressionGroups.includes(group)&&report&&inventory,'Usage: backend-regression-selection.mjs group report inventory --exclude=file...');
  assert.ok(args.every(arg=>arg.startsWith('--exclude=')),'Only exact existing exclusions are accepted');
  const plan=partitionRegressionFiles(globSync('src/__tests__/**/*.test.ts'),args.map(arg=>arg.slice('--exclude='.length)));
  const files=plan.groups[group];
  assert.ok(files.length,'A selected regression group must not be empty');
  const expectedFiles=group==='fixtures'?[...files,...plan.special].sort():files;
  const execution={runId:process.env.GITHUB_RUN_ID??null,sha:process.env.GITHUB_SHA??null,attempt:Number(process.env.GITHUB_RUN_ATTEMPT)||null};
  writeFileSync(inventory,JSON.stringify({group,execution,expectedFiles,fullExpectedFiles:plan.expectedFiles},null,2)+'\n');
  console.log(`Regression ${group}: ${files.length} serial main files${group==='fixtures'?`, plus ${plan.special.length} existing explicit consumers`:''}`);
  const child=spawnSync(process.execPath,[resolve('node_modules/vitest/vitest.mjs'),'run',...files,
    '--no-file-parallelism','--reporter=default','--reporter=json',`--outputFile=${report}`],{stdio:'inherit',env:process.env});
  if(child.error)console.error(child.error);
  process.exitCode=child.status??1;
}
