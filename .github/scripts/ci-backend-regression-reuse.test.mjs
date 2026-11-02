import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyGroupInventories} from './ci-backend-regression-reuse.mjs';
import {regressionGroups} from './backend-regression-selection.mjs';

const sha='a'.repeat(40);
const build=(groups=regressionGroups)=>groups.map((group,i)=>({
  group,
  execution:{runId:'123',sha,attempt:1},
  expectedFiles:['src/__tests__/unit/'+group+'.test.ts'],
  fullExpectedFiles:groups.map(g=>'src/__tests__/unit/'+g+'.test.ts').sort()
}));
test('all original fixture and shard tests must be covered exactly once',()=>{
 const reports=build();
 assert.equal(verifyGroupInventories(reports,{runId:123,attempt:1}),sha);
 assert.throws(()=>verifyGroupInventories(reports.slice(1),{runId:123,attempt:1}));
 assert.throws(()=>verifyGroupInventories([...reports.slice(1),reports[1]],{runId:123,attempt:1}));
 assert.throws(()=>verifyGroupInventories(reports.map((r,i)=>i? r : {...r,execution:{...r.execution,runId:'222'}}),{runId:123,attempt:1}));
 assert.throws(()=>verifyGroupInventories(reports.map((r,i)=>i? r : {...r,execution:{...r.execution,sha:'b'.repeat(40)}}),{runId:123,attempt:1}));
 assert.throws(()=>verifyGroupInventories(reports.map((r,i)=>i? r : {...r,execution:{...r.execution,attempt:2}}),{runId:123,attempt:1}));
 assert.throws(()=>verifyGroupInventories(reports.map((r,i)=>i? r : {...r,fullExpectedFiles:[]}),{runId:123,attempt:1}));
 assert.throws(()=>verifyGroupInventories(reports.map((r,i)=>i? r : {...r,expectedFiles:reports[1].expectedFiles}),{runId:123,attempt:1}));
 assert.throws(()=>verifyGroupInventories(reports.map((r,i)=>i? r : {...r,expectedFiles:['src/__tests__/unit/unlisted.test.ts']}),{runId:123,attempt:1}));
});
