import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {binding,personalTrackingReadyPlan,personalTrackingReadyOutputs,admitOriginalReports,admitOriginalReportsInChild,verifyOriginalImages} from './personal-tracking-ready.mjs';
import {changedEntries} from './content-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const options={event:'pull_request',branch:binding.branch,draft:false};
test('original local cases and failed continuations retain their provenance without replay',async()=>{
 const result=await admitOriginalReports();assert(result.caseCount>=31);assert.equal(result.ciExecuted,false);
 assert(result.admitted.every(r=>r.originalSigned===false&&r.ciExecuted===false));
 await assert.rejects(admitOriginalReports(file=>file===binding.reports[0].file?Buffer.from('{}'):readFileSync(file)),/Original reporter changed/);
});
test('exact app pins reject unknown inputs, changed main and full fallback',()=>{
 const entries=changedEntries(binding.base,head),plan=personalTrackingReadyPlan(entries,binding.base,head,options);
 assert.equal(plan.draft,false);assert.equal(plan.route,'personal-tracking');
 assert.throws(()=>personalTrackingReadyPlan(entries,'0'.repeat(40),head,options),/main base changed/);
 assert.throws(()=>personalTrackingReadyPlan(entries,binding.base,head,{...options,forceFull:true}),/whole-platform/);
 assert.throws(()=>personalTrackingReadyPlan([...entries,{file:'server-version/backend/src/modules/auth/extra.ts',status:'A',oldMode:'000000',newMode:'100644'}],binding.base,head,options),/unplanned/);
 assert.equal(personalTrackingReadyPlan(entries,binding.base,head,{...options,branch:'other'}),null);
});
test('Ready requires actual native/image/SAST success; Draft never qualifies',()=>{
 const plan=personalTrackingReadyPlan(changedEntries(binding.base,head),binding.base,head,options),outputs=Object.fromEntries(Object.entries(personalTrackingReadyOutputs(plan)).map(([k,v])=>[k,String(v)]));
 const needs={scope:{result:'success',outputs},'personal-tracking':{result:'success'},docker:{result:'success'},codeql:{result:'success'},docker:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','personal-tracking',...(plan.imageReuse?[]:['docker']),'codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 for(const key of ['personal-tracking',...(plan.imageReuse?[]:['docker']),'codeql'])assert(failedChecks({...needs,[key]:{result:'skipped'}},false).includes(key));
 assert(failedChecks(needs,true).includes('scope'));
});

test('actual entrypoint child resolves original admission without a top-level-await cycle',()=>{
 const result=admitOriginalReportsInChild();assert(result.caseCount>=31);assert.equal(result.ciExecuted,false);
});
test('image reuse refuses failed, skipped or expired original producer steps',async()=>{
 const plan=personalTrackingReadyPlan(changedEntries(binding.base,head),binding.base,head,options),old=process.env.GH_TOKEN;process.env.GH_TOKEN='synthetic-unit-read-token';
 const proof=binding.imageReuse??binding.historicalImageSuccess,imagePlan={...plan,imageReuse:proof};
 const now=Date.now(),steps=['validate compose','assert prelaunch resource and HTTPS contract','assert API/worker isolation topology','validate monitoring compose','build production images','verify production Nginx static asset MIME and security headers','scan backend image (high and critical)','scan frontend image (high and critical)'].map(name=>({name,conclusion:'success'}));
 const job={id:proof.jobId,run_id:proof.runId,head_sha:proof.executionHead,name:'docker (compose config + production builds) / production image build and scan',status:'completed',conclusion:'success',completed_at:new Date(now).toISOString(),steps};
 const run={id:job.run_id,head_sha:proof.sourceHead,event:'pull_request',path:'.github/workflows/ci.yml',conclusion:'failure'};
 const fake=value=>async url=>({ok:true,status:200,json:async()=>url.includes('/jobs/')?value:run});
 try{assert.equal((await verifyOriginalImages(imagePlan,fake(job),now,proof)).reexecuted,false);await assert.rejects(verifyOriginalImages(imagePlan,fake({...job,conclusion:'failure'}),now,proof));await assert.rejects(verifyOriginalImages(imagePlan,fake({...job,steps:steps.map(s=>({...s,conclusion:s.name.startsWith('scan')?'skipped':s.conclusion}))}),now,proof));await assert.rejects(verifyOriginalImages(imagePlan,fake({...job,completed_at:new Date(now-25*3600000).toISOString()}),now,proof));}finally{if(old===undefined)delete process.env.GH_TOKEN;else process.env.GH_TOKEN=old;}
});
