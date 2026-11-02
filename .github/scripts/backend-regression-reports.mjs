import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// Disjoint executions, not a retry union. Keep every original JSON artifact.
export function mergeRegressionReports(reports){
  assert.ok(reports.length>=2,'Every selected regression execution must produce a report');
  const files=new Set();
  for(const r of reports){
    assert.equal(typeof r.success,'boolean');assert.ok(Array.isArray(r.testResults)&&r.testResults.length>0);
    assert.ok(Number.isFinite(r.startTime));
    for(const suite of r.testResults){
      assert.equal(typeof suite.name,'string');assert.ok(suite.name.length>0);
      assert.ok(!files.has(suite.name),'Regression executions must not overlap');files.add(suite.name);
    }
  }
  const out={...reports[0],success:reports.every(r=>r.success&&!r.wasInterrupted&&r.numFailedTests===0),startTime:Math.min(...reports.map(r=>r.startTime)),
    wasInterrupted:reports.some(r=>r.wasInterrupted),testResults:reports.flatMap(r=>r.testResults)};
  for(const key of Object.keys(out).filter(k=>/^num/.test(k))){
    assert.ok(reports.every(r=>Number.isSafeInteger(r[key])&&r[key]>=0),`Invalid regression counter: ${key}`);
    out[key]=reports.reduce((n,r)=>n+r[key],0);
  }
  return out;
}
// Exact file coverage for the scheduled groups; no pass/skip state is rewritten.
export function assertRegressionFiles(report,expectedFiles){
  const relative=name=>{
    const marker='src/__tests__/',at=name.lastIndexOf(marker);
    assert.ok(at>=0,`Unexpected regression report path: ${name}`);
    return name.slice(at);
  };
  const actual=report.testResults.map(suite=>relative(suite.name)).sort();
  assert.equal(new Set(expectedFiles).size,expectedFiles.length,'Duplicate expected regression file');
  assert.deepEqual(actual,[...expectedFiles].sort(),'Regression file coverage must be complete and disjoint');
}
export function assertRegressionGroupCoverage(result,inventories){
  assert.deepEqual(inventories.map(plan=>plan.group).sort(),['fixtures','shard-1','shard-2','shard-3','shard-4']);
  for(const plan of inventories)assert.deepEqual(plan.fullExpectedFiles,inventories[0].fullExpectedFiles,'Group inventories must agree');
  assert.deepEqual(inventories.flatMap(plan=>plan.expectedFiles).sort(),inventories[0].fullExpectedFiles,'Planned groups must cover the original regression exactly');
  assertRegressionFiles(result,inventories[0].fullExpectedFiles);
}
// Native Actions retries retain successful earlier jobs in this same run. Pick
// each group's newest attempt, even when it failed; never fall back to older JSON.
export function collectRegressionGroups(directory,execution,groupResult){
  assert.equal(groupResult,'success','Every scheduled regression group must succeed, including its report upload');
  assert.match(execution.runId,/^[0-9]+$/);assert.match(execution.sha,/^[a-f0-9]{40}$/);
  assert.ok(Number.isSafeInteger(execution.attempt)&&execution.attempt>=1);
  const latest=new Map();
  for(const entry of readdirSync(directory,{withFileTypes:true})){
    const match=/^backend-regression-group-(fixtures|shard-[1-4])-run-([0-9]+)-attempt-([0-9]+)$/.exec(entry.name);
    assert.ok(entry.isDirectory()&&match,`Unexpected regression artifact: ${entry.name}`);
    const [,group,runId,number]=match,attempt=Number(number);
    assert.equal(runId,execution.runId,'Only this native Actions run is eligible');
    assert.ok(Number.isSafeInteger(attempt)&&attempt>=1&&attempt<=execution.attempt,'Invalid artifact attempt');
    if(!latest.has(group)||latest.get(group).attempt<attempt)latest.set(group,{group,attempt,artifact:entry.name});
  }
  const groups=['fixtures','shard-1','shard-2','shard-3','shard-4'];
  assert.deepEqual([...latest.keys()].sort(),groups,'Every group must have its own original artifact');
  const inventories=[],reports=[],selected=[];
  for(const group of groups){
    const item=latest.get(group),root=join(directory,item.artifact);
    const plan=JSON.parse(readFileSync(join(root,`eduk12-backend-inventory-${group}.json`),'utf8'));
    assert.equal(plan.group,group);
    assert.deepEqual(plan.execution,{runId:execution.runId,sha:execution.sha,attempt:item.attempt},'Artifact identity and inventory provenance must agree');
    inventories.push(plan);
    reports.push(JSON.parse(readFileSync(join(root,`eduk12-backend-vitest-${group}.json`),'utf8')));
    selected.push({...item,execution:plan.execution});
  }
  const result=mergeRegressionReports(reports);
  assertRegressionGroupCoverage(result,inventories);
  return {result,selected};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [output,...args]=process.argv.slice(2);
  if(args[0]==='--collect'){
    assert.equal(args.length,2,'Usage: backend-regression-reports.mjs output --collect current-run-artifact-directory');
    const execution={runId:process.env.GITHUB_RUN_ID,sha:process.env.GITHUB_SHA,attempt:Number(process.env.GITHUB_RUN_ATTEMPT)};
    const {result,selected}=collectRegressionGroups(args[1],execution,process.env.REGRESSION_GROUP_RESULT);
    writeFileSync(output,JSON.stringify(result));
    writeFileSync(output+'.groups.json',JSON.stringify({execution,selected},null,2)+'\n');
    if(!result.success)process.exitCode=1;
  }else{
    assert.ok(output&&args.length>=2,'Usage: backend-regression-reports.mjs output base additional-report...');
    const result=mergeRegressionReports(args.map(p=>JSON.parse(readFileSync(p,'utf8'))));
    writeFileSync(output,JSON.stringify(result));
    if(!result.success)process.exitCode=1;
  }
}
