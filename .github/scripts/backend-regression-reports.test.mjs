import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeRegressionReports} from './backend-regression-reports.mjs';
const report=(name,pass=true)=>({success:pass,startTime:123,numTotalTests:1,numPassedTests:pass?1:0,numFailedTests:pass?0:1,
  testResults:[{name,status:pass?'passed':'failed',assertionResults:[{status:pass?'passed':'failed'}]}]});
test('combines disjoint files and preserves counts, failures, interruption and original identities',()=>{
  const base=report('base',false),extra={...report('isolated-export'),startTime:200,wasInterrupted:true};
  const result=mergeRegressionReports([base,extra]);
  assert.equal(result.success,false);assert.equal(result.wasInterrupted,true);assert.equal(result.startTime,123);
  assert.equal(result.numPassedTests,1);assert.equal(result.numFailedTests,1);assert.equal(result.numTotalTests,2);
  assert.deepEqual(result.testResults,[base.testResults[0],extra.testResults[0]]);
  assert.equal(base.numTotalTests,1);
});
test('only all successful, uninterrupted disjoint executions qualify',()=>{
  assert.equal(mergeRegressionReports([report('base'),report('export')]).success,true);
  assert.equal(mergeRegressionReports([report('base'),{...report('export'),wasInterrupted:true}]).success,false);
});
test('preserves all five phase reports, including a failure between successful phases',()=>{
  const reports=['bundle','course','base','roster','export'].map(name=>report(name));
  const success=mergeRegressionReports(reports);
  assert.equal(success.success,true);assert.equal(success.numTotalTests,5);
  assert.deepEqual(success.testResults,reports.flatMap(r=>r.testResults));
  reports[1]=report('course',false);
  const failed=mergeRegressionReports(reports);
  assert.equal(failed.success,false);assert.equal(failed.numFailedTests,1);
  assert.equal(failed.numPassedTests,4);assert.equal(failed.testResults[1].status,'failed');
  assert.equal(reports[1].success,false);
  assert.throws(()=>mergeRegressionReports([...reports,report('course')]));
});
test('missing, overlapping, empty and malformed reports are refused',()=>{
  for(const reports of [[report('a')],[report('a'),report('a')],[report('a'),{...report('b'),testResults:[]}],
    [report('a'),{...report('b'),numTotalTests:NaN}]])assert.throws(()=>mergeRegressionReports(reports));
});

test('six serial shards and the retained fixture lane cover the exact existing file inventory once',async()=>{
  const {globSync,readFileSync}=await import('node:fs');
  const {fileURLToPath}=await import('node:url');
  const {partitionRegressionFiles,regressionGroups,backendOwnedFile}=await import('./backend-regression-selection.mjs');
  const backend=fileURLToPath(new URL('../../server-version/backend/',import.meta.url));
  const files=globSync('src/__tests__/**/*.test.ts',{cwd:backend});
  const workflow=readFileSync(new URL('../workflows/ci-backend-regression.yml',import.meta.url),'utf8');
  const excluded=[...workflow.matchAll(/--exclude=(src\/__tests__\/\S+\.test\.ts)/g)].map(match=>match[1]);
  const plan=partitionRegressionFiles(files,excluded);
  assert.deepEqual(Object.keys(plan.groups),regressionGroups);
  const selected=[...Object.values(plan.groups).flat(),...plan.special];
  assert.equal(new Set(selected).size,selected.length);
  assert.deepEqual(selected.sort(),files.filter(file=>file!==backendOwnedFile).sort());
  assert.deepEqual(plan.expectedFiles,selected);
  for(const group of regressionGroups)assert.ok(plan.groups[group].length>0);
  const sizes=regressionGroups.slice(1).map(group=>plan.groups[group].length);
  assert.ok(Math.max(...sizes)-Math.min(...sizes)<=1);
  for(const leaf of ['trainingStandaloneScaleGroup','trainingStandaloneCognitiveGroup','trainingLegacyScaleStart',
    'teacherPrivateCompositionLongitudinal','teacherNumericGroup','teacherNumericPartial','teacherNativeGroup',
    'teacherGroupTransaction','teacherPersonalLongitudinal.browser','schoolPersonalLongitudinal.browser'])
    assert.ok(plan.groups.fixtures.includes(`src/__tests__/integration/${leaf}.postgres.integration.test.ts`),leaf);
  for(const file of ['assessment-authorization/education-draft-replacement-audit.postgres.integration.test.ts',
    'survey/onboarding-pagination.postgres.integration.test.ts','scale/pr356-entry-lifecycle.postgres.integration.test.ts',
    'measurement-content/private-reference-expiry.postgres.integration.test.ts',
    'bundle-onboarding/education-native-continuation.postgres.integration.test.ts'])
    assert.ok(plan.groups.fixtures.includes(`src/__tests__/${file}`),file);
  assert.throws(()=>partitionRegressionFiles([...files,files[0]],excluded));
  assert.throws(()=>partitionRegressionFiles(files,[...excluded,'src/__tests__/missing.test.ts']));
  assert.throws(()=>partitionRegressionFiles(files,excluded.filter(file=>file!==backendOwnedFile)));
});

test('weighted regression scheduling is deterministic, balanced and rejects invalid weights',async()=>{
  const {scheduleWeightedRegressionShards,estimateRegressionFileMs,historicalRegressionFileMs,regressionWeightSources}=await import('./backend-regression-selection.mjs');
  assert.equal(regressionWeightSources.length,3,'File weights use three full green runs');
  assert.equal(new Set(regressionWeightSources).size,3);
  assert.ok(Object.keys(historicalRegressionFileMs).length>=1300,'Missing recorded per-file observations');
  const measured=Object.keys(historicalRegressionFileMs)[0];
  assert.equal(estimateRegressionFileMs('src/__tests__/'+measured),historicalRegressionFileMs[measured]);
  const heavy=Array.from({length:6},(_,i)=>`src/__tests__/integration/slow-${i}.test.ts`);
  const light=Array.from({length:12},(_,i)=>`src/__tests__/utils/fast-${i}.test.ts`);
  const files=[...heavy,...light];
  const weightOf=file=>file.includes('/integration/')?20000:1000;
  const first=scheduleWeightedRegressionShards(files,weightOf);
  assert.deepEqual(scheduleWeightedRegressionShards([...files].reverse(),weightOf),first);
  assert.deepEqual(first.map(group=>group.length),[3,3,3,3,3,3]);
  assert.deepEqual(first.flat().sort(),files.sort());
  assert.deepEqual(first.map(group=>group.filter(file=>file.includes('/integration/')).length),[1,1,1,1,1,1]);
  assert.equal(estimateRegressionFileMs('src/__tests__/new-directory/a.test.ts'),3000);
  assert.equal(estimateRegressionFileMs('src/__tests__/integration/nonexistent.test.ts'),3000,'Unknown files must not inherit a directory-average weight');
  assert.throws(()=>scheduleWeightedRegressionShards(files,()=>0),/Invalid regression scheduling weight/);
});

test('complete-group report coverage rejects missing, foreign and duplicate paths without changing verdicts',async()=>{
  const {assertRegressionFiles}=await import('./backend-regression-reports.mjs');
  const expected=['src/__tests__/one.test.ts','src/__tests__/two.test.ts'];
  const combined=mergeRegressionReports(expected.map(file=>report('/runner/server-version/backend/'+file)));
  assert.doesNotThrow(()=>assertRegressionFiles(combined,expected));
  assert.throws(()=>assertRegressionFiles(combined,expected.slice(0,1)));
  assert.throws(()=>assertRegressionFiles(combined,[...expected,'src/__tests__/three.test.ts']));
  assert.throws(()=>assertRegressionFiles(combined,[expected[0],expected[0]]));
  assert.equal(combined.success,true);assert.equal(combined.numTotalTests,2);
});

test('group aggregation refuses missing, repeated or inconsistent inventories',async()=>{
  const {assertRegressionGroupCoverage}=await import('./backend-regression-reports.mjs');
  const {regressionGroups:names}=await import('./backend-regression-selection.mjs');
  const files=names.map(name=>`src/__tests__/${name}.test.ts`).sort();
  const plans=names.map(group=>({group,expectedFiles:[`src/__tests__/${group}.test.ts`],fullExpectedFiles:files}));
  const combined=mergeRegressionReports(files.map(file=>report(file)));
  assert.doesNotThrow(()=>assertRegressionGroupCoverage(combined,plans));
  assert.throws(()=>assertRegressionGroupCoverage(combined,plans.slice(0,-1)));
  assert.throws(()=>assertRegressionGroupCoverage(combined,[...plans.slice(0,-1),plans[0]]));
  assert.throws(()=>assertRegressionGroupCoverage(combined,plans.map((p,i)=>i? p:{...p,fullExpectedFiles:files.slice(0,-1)})));
  assert.throws(()=>assertRegressionGroupCoverage(combined,plans.map((p,i)=>i? p:{...p,expectedFiles:[]})));
});

test('same-run retries retain immutable attempts and choose newest per group without success fallback',async t=>{
  const {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os'),{join}=await import('node:path');
  const {collectRegressionGroups}=await import('./backend-regression-reports.mjs');
  const directory=mkdtempSync(join(tmpdir(),'regression-attempts-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const execution={runId:'123',sha:'a'.repeat(40),attempt:2};
  const {regressionGroups:groups}=await import('./backend-regression-selection.mjs');
  const files=groups.map(group=>`src/__tests__/${group}.test.ts`).sort();
  function artifact(group,attempt,passed=true,changes={}){
    const dir=join(directory,`backend-regression-group-${group}-run-123-attempt-${attempt}`);mkdirSync(dir,{recursive:true});
    const file=`src/__tests__/${group}.test.ts`;
    writeFileSync(join(dir,`eduk12-backend-inventory-${group}.json`),JSON.stringify({group,execution:{...execution,attempt},expectedFiles:[file],fullExpectedFiles:files,...changes}));
    const reportFile=join(dir,`eduk12-backend-vitest-${group}.json`);writeFileSync(reportFile,JSON.stringify(report(file,passed)));return reportFile;
  }
  for(const group of groups)artifact(group,1);
  assert.equal(collectRegressionGroups(directory,execution,'success').result.success,true);
  const failed=artifact('shard-2',2,false),failureBytes=readFileSync(failed,'utf8');
  const latest=collectRegressionGroups(directory,execution,'success');
  assert.equal(latest.result.success,false);assert.equal(latest.result.numFailedTests,1);
  assert.equal(latest.selected.find(row=>row.group==='shard-2').attempt,2);
  assert.equal(latest.selected.find(row=>row.group==='shard-1').attempt,1);
  assert.equal(readFileSync(failed,'utf8'),failureBytes,'Original failed JSON remains immutable');
  assert.throws(()=>collectRegressionGroups(directory,execution,'failure'));
  assert.throws(()=>collectRegressionGroups(directory,{...execution,runId:'456'},'success'));
  assert.throws(()=>collectRegressionGroups(directory,{...execution,sha:'b'.repeat(40)},'success'));
  assert.throws(()=>collectRegressionGroups(directory,{...execution,attempt:1},'success'));
  rmSync(failed);assert.throws(()=>collectRegressionGroups(directory,execution,'success'),'Missing newest report cannot use an older one');
  writeFileSync(failed,'malformed');assert.throws(()=>collectRegressionGroups(directory,execution,'success'));
});
