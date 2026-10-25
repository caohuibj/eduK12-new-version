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
test('only both successful, uninterrupted disjoint executions qualify',()=>{
  assert.equal(mergeRegressionReports([report('base'),report('export')]).success,true);
  assert.equal(mergeRegressionReports([report('base'),{...report('export'),wasInterrupted:true}]).success,false);
});
test('missing, overlapping, empty and malformed reports are refused',()=>{
  for(const reports of [[report('a')],[report('a'),report('a')],[report('a'),{...report('b'),testResults:[]}],
    [report('a'),{...report('b'),numTotalTests:NaN}]])assert.throws(()=>mergeRegressionReports(reports));
});
