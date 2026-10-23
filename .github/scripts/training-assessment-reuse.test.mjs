import test from 'node:test';
import assert from 'node:assert/strict';
import {original,verifyOriginalStage,verifyReuseInputs} from './training-assessment-reuse.mjs';
function fixture(kind){
 const run={id:original.run,head_sha:original.source,head_repository:{full_name:'caohuibj/eduK12-new-version'},head_branch:'work/training-assessment-performance-20261023',event:'pull_request',path:'.github/workflows/ci.yml',pull_requests:[{number:343}],conclusion:'failure'};
 const names=kind==='backend'?['install official locked backend dependencies','generate types from unchanged schema without a database','compile affected backend candidate once','execute selector permission and projection assertions','Run actions/upload-artifact@v4']:kind==='frontend'?['install official locked frontend dependencies','lint only changed frontend source and tests']:['initialize CodeQL','analyze with CodeQL'];
 const job={id:original[kind],head_sha:original.source,run_id:original.run,status:'completed',name:kind==='sast'?'codeql (javascript/typescript SAST)':'training-assessment / '+kind,conclusion:kind==='frontend'?'failure':'success',completed_at:new Date().toISOString(),steps:names.map(name=>({name,status:'completed',conclusion:'success'}))};
 if(kind==='frontend')job.steps.push({name:'check affected app and cognitive TypeScript contracts once',status:'completed',conclusion:'failure'});
 return {run,job};
}
for(const kind of ['backend','frontend','sast'])test('accepts only actual successful '+kind+' stages and retains parent failure',()=>{const f=fixture(kind);assert.equal(verifyOriginalStage(f.run,f.job,kind).originalParentConclusion,'failure');for(const value of ['failure','skipped','cancelled']){const x=fixture(kind);x.job.steps[0].conclusion=value;assert.throws(()=>verifyOriginalStage(x.run,x.job,kind))}for(const mutate of [x=>x.run.head_sha='a'.repeat(40),x=>x.run.pull_requests=[],x=>x.job.id++,x=>x.job.completed_at=new Date(Date.now()-86400001).toISOString()]){const x=fixture(kind);mutate(x);assert.throws(()=>verifyOriginalStage(x.run,x.job,kind))}});
test('component drift cannot reuse a successful original stage',()=>{for(const kind of ['backend','frontend','sast'])assert.throws(()=>verifyReuseInputs(kind,(_command,ref)=>ref.startsWith('HEAD:')?'changed-tree':'original-tree'))});
