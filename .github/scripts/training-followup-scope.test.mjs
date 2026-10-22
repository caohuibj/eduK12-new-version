import assert from 'node:assert/strict';
import {test} from 'node:test';
import {followup,followupPath,trainingFollowupPlan} from './training-followup-scope.mjs';
import {trainingWorkspaceOutputs} from './training-workspace-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
import {verifySourceJob} from './training-followup-reuse.mjs';
const head='a'.repeat(40);
const entries=()=>[...Object.entries(followup.source).map(([file,b])=>({file,status:b.before?'M':'A',oldMode:b.before?'100644':'000000',newMode:'100644'})),...followup.controls.map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}))];
const read=(_,ref)=>{const [sha,file]=ref.split(':');return file==='server-version/frontend'?followup.components.frontend:file==='server-version/backend'?followup.components.backend:followup.source[file]?.[sha===followup.base?'before':'after'];};
test('admits exactly 50 product files and the explicit controls without unrelated jobs',()=>{
 const plan=trainingFollowupPlan(entries(),followup.base,head,read);
 assert.equal(plan.sourceCount,50);assert.equal(plan.candidate,'mac-followup');
 const outputs=Object.fromEntries(Object.entries(trainingWorkspaceOutputs(plan)).map(([key,value])=>[key,String(value)]));
 const needs={scope:{result:'success',outputs},'training-workspace':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','training-workspace','codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 for(const job of ['scope','training-workspace','codeql'])for(const result of ['skipped','failure','cancelled',undefined])assert.ok(failedChecks({...needs,[job]:{...needs[job],result}},false).length);
 assert.ok(failedChecks(needs,true).length);assert.equal(outputs.perf_smoke,'false');assert.equal(outputs.ops,'false');
});
for(const [name,mutate] of [
 ['extra path',list=>list.push({file:'server-version/backend/src/index.ts',status:'M',oldMode:'100644',newMode:'100644'})],
 ['missing product',list=>list.splice(0,1)],['duplicate',list=>list.push({...list[0]})],
 ['deleted path',list=>{list[0].status='D';list[0].newMode='000000';}],
 ['symlink',list=>{list[0].newMode='120000';}],
 ['renamed path',list=>{list[0].status='R';}],
 ['changed binding',list=>{const entry=list.find(item=>item.file===followupPath);entry.status='M';entry.oldMode='100644';}],
])test('rejects '+name,()=>{const list=entries();mutate(list);assert.throws(()=>trainingFollowupPlan(list,followup.base,head,read));});
test('rejects product drift, changed base and full/manual execution',()=>{
 assert.throws(()=>trainingFollowupPlan(entries(),head,head,read));
 assert.throws(()=>trainingFollowupPlan(entries(),followup.base,head,()=>head));
 const previous={event:process.env.CI_EVENT,force:process.env.CI_FORCE_FULL};
 try {process.env.CI_EVENT='workflow_dispatch';assert.throws(()=>trainingFollowupPlan(entries(),followup.base,head,read));process.env.CI_EVENT='pull_request';process.env.CI_FORCE_FULL='true';assert.throws(()=>trainingFollowupPlan(entries(),followup.base,head,read));}
 finally {for(const [key,value] of Object.entries({CI_EVENT:previous.event,CI_FORCE_FULL:previous.force})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
 assert.equal(trainingFollowupPlan([],followup.base,head,read),null);
});
test('admits only the fixed official successful stages, retaining the browser failure',()=>{
 const now=Date.parse('2026-10-22T04:00:00Z'),binding=followup.reuse;
 const run={id:binding.runId,head_sha:binding.head,event:'pull_request',path:'.github/workflows/ci.yml',head_branch:'work/training-followup-integrated-20261022',head_repository:{full_name:'caohuibj/eduK12-new-version'},pull_requests:[{number:332}],conclusion:'failure'};
 for(const component of ['frontend','backend']){
  const selected=binding[component],job={id:selected.jobId,run_id:binding.runId,name:selected.jobName,status:'completed',conclusion:'success',completed_at:'2026-10-22T03:00:00Z',steps:[{name:component==='frontend'?'affected lint, integrated types, four direct contracts and one build':'integrated types, disposable migration and seven form authority contracts',conclusion:'success'}]};
  verifySourceJob(run,job,component,now);
  for(const conclusion of ['failure','cancelled','skipped',null])assert.throws(()=>verifySourceJob(run,{...job,conclusion},component,now));
  assert.throws(()=>verifySourceJob({...run,head_sha:head},job,component,now));
  assert.throws(()=>verifySourceJob({...run,pull_requests:[{number:327}]},job,component,now));
  assert.throws(()=>verifySourceJob(run,{...job,id:119614232339,name:'training-workspace / followup / browser'},component,now));
  assert.throws(()=>verifySourceJob(run,{...job,completed_at:'2026-10-20T03:00:00Z'},component,now));
  assert.throws(()=>verifySourceJob(run,{...job,steps:[]},component,now));
 }
});
