import {readFileSync,writeFileSync} from 'node:fs';
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
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [output,...inputs]=process.argv.slice(2);
  assert.ok(output&&inputs.length>=2,'Usage: backend-regression-reports.mjs output base additional-report...');
  const result=mergeRegressionReports(inputs.map(p=>JSON.parse(readFileSync(p,'utf8'))));
  writeFileSync(output,JSON.stringify(result));
  if(!result.success)process.exitCode=1;
}
