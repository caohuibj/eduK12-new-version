import {test} from 'node:test';import assert from 'node:assert/strict';import {verifyReport} from './pr357-checks.mjs';
const file='src/actual.test.ts';const good={success:true,numFailedTests:0,numPendingTests:0,numPassedTests:1,testResults:[{name:'/app/'+file,status:'passed',assertionResults:[{status:'passed'}]}]};
test('report admission rejects empty, skipped, filtered, failed and missing requested files',()=>{
 assert.equal(verifyReport(good,[file]).passed,1);
 for(const change of [{success:false},{numFailedTests:1},{numPendingTests:1},{numPassedTests:0},{testResults:[]},{testResults:[{...good.testResults[0],assertionResults:[]}]},{testResults:[{...good.testResults[0],assertionResults:[{status:'pending'}]}]}])assert.throws(()=>verifyReport({...good,...change},[file]));
 assert.throws(()=>verifyReport(good,['src/other.test.ts']));
});
