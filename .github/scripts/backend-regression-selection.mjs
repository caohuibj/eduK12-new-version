import assert from 'node:assert/strict';
import {globSync,readFileSync,writeFileSync} from 'node:fs';
import {matchesGlob,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// Six isolated shards share the full non-fixture inventory. Balance estimated
// wall-clock cost (including serial Vitest imports), not simply file counts.
// The producer/consumer fixture lane remains untouched, and report coverage
// stays fail-closed. The workflow matrix must list the same groups.
export const regressionShardCount=6;
export const regressionGroups=['fixtures',...Array.from({length:regressionShardCount},(_,i)=>`shard-${i+1}`)];
export const backendOwnedFile='src/__tests__/questionnaire/aggregate-report.postgres.integration.test.ts';

// Auditable exact-file timing snapshot from three green complete CI runs.
// File completion gaps approximate serial Vitest import + execution overhead;
// the cap and median suppress transient log/runner noise. A newly introduced
// test uses the conservative default, never an invented same-directory mean.
const timingSnapshot=JSON.parse(readFileSync(new URL('../config/backend-regression-file-weights.json',import.meta.url),'utf8'));
assert.equal(timingSnapshot.schema,1,'Unknown regression timing snapshot schema');
assert.ok(Array.isArray(timingSnapshot.sourceRuns)&&timingSnapshot.sourceRuns.length>=3
  &&new Set(timingSnapshot.sourceRuns).size===timingSnapshot.sourceRuns.length,'Timing snapshot needs three distinct full runs');
assert.ok(timingSnapshot.weights&&typeof timingSnapshot.weights==='object'&&!Array.isArray(timingSnapshot.weights),'Missing regression file weights');
for(const [file,ms] of Object.entries(timingSnapshot.weights)){
  assert.ok(file.endsWith('.test.ts')&&!file.startsWith('/')&&!file.includes('..'),'Invalid regression timing file');
  assert.ok(Number.isFinite(ms)&&ms>=200&&ms<=30000,'Invalid measured regression file weight');
}
export const regressionWeightSources=Object.freeze([...timingSnapshot.sourceRuns]);
export const historicalRegressionFileMs=Object.freeze(timingSnapshot.weights);
export const estimateRegressionFileMs=file=>
  historicalRegressionFileMs[file.slice('src/__tests__/'.length)]??3000;

// Deterministic longest-estimated-file-first allocation. Exact shard
// capacities preserve the existing near-equal file counts while balancing
// expensive individual test files. Unknown files receive 3s.
export function scheduleWeightedRegressionShards(files,weightOf=estimateRegressionFileMs){
  const weights=new Map(files.map(file=>{
    const weight=weightOf(file);
    assert.ok(Number.isFinite(weight)&&weight>0,'Invalid regression scheduling weight: '+file);
    return [file,weight];
  }));
  const ordered=[...files].sort((a,b)=>weights.get(b)-weights.get(a)||(a<b?-1:a>b?1:0));
  const shards=Array.from({length:regressionShardCount},()=>[]);
  const loads=Array(regressionShardCount).fill(0);
  const low=Math.floor(files.length/regressionShardCount),extra=files.length%regressionShardCount;
  for(const file of ordered){
    let chosen=-1;
    for(let i=0;i<regressionShardCount;i++){
      if(shards[i].length>=low+(i<extra?1:0))continue;
      if(chosen<0||loads[i]<loads[chosen])chosen=i;
    }
    assert.notEqual(chosen,-1,'No regression shard has capacity');
    shards[chosen].push(file);
    loads[chosen]+=weights.get(file);
  }
  return shards.map(files=>files.sort());
}

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
  const regular=[];
  for(const file of [...files].sort()){
    assert.ok(file.startsWith('src/__tests__/')&&file.endsWith('.test.ts'),`Unexpected test path: ${file}`);
    if(excludedSet.has(file))continue;
    const retained=fixturePatterns.some(pattern=>matchesGlob(file.slice('src/__tests__/'.length),pattern));
    if(retained)groups.fixtures.push(file);
    else regular.push(file);
  }
  const shards=scheduleWeightedRegressionShards(regular);
  shards.forEach((paths,index)=>{groups[`shard-${index+1}`]=paths;});
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
  if(group==='fixtures'){
    console.log(`Regression fixtures: ${files.length} serial main files, plus ${plan.special.length} existing explicit consumers; no runtime prediction (separate producer/consumer/restore phases)`);
  }else{
    const estimatedSeconds=Math.round(files.reduce((sum,file)=>sum+estimateRegressionFileMs(file),0)/1000);
    console.log(`Regression ${group}: ${files.length} serial main files; estimated file-weight ${estimatedSeconds}s (not full job duration)`);
  }
  const child=spawnSync(process.execPath,[resolve('node_modules/vitest/vitest.mjs'),'run',...files,
    '--no-file-parallelism','--reporter=default','--reporter=json',`--outputFile=${report}`],{stdio:'inherit',env:process.env});
  if(child.error)console.error(child.error);
  process.exitCode=child.status??1;
}
