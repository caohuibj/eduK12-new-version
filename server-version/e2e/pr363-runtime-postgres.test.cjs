const {test}=require('node:test'),assert=require('node:assert/strict'),{assertSelectedRuntimeCases}=require('./pr363-runtime-postgres.cjs')
test('selected runtime qualification requires the exact complete case set without skips or invented success',()=>{
 const expected=['case1','case2'],r={success:true,numPassedTests:2,numFailedTests:0,numPendingTests:0,testResults:[{assertionResults:expected.map(fullName=>({fullName,status:'passed'}))}]};assertSelectedRuntimeCases(r,expected)
 for(const patch of [{success:false},{numPendingTests:1},{numFailedTests:1},{numPassedTests:1},{testResults:[{assertionResults:[{fullName:'case1',status:'passed'}]}]},{testResults:[{assertionResults:[{fullName:'case1',status:'passed'},{fullName:'unknown',status:'passed'}]}]}])assert.throws(()=>assertSelectedRuntimeCases({...r,...patch},expected))
 assert.throws(()=>assertSelectedRuntimeCases(r,[]));assert.throws(()=>assertSelectedRuntimeCases(r,['case1','case1']))
})
