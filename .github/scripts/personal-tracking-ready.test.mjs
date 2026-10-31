import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {binding,personalTrackingReadyPlan,personalTrackingReadyOutputs,admitOriginalReports,admitOriginalReportsInChild,verifyOriginalImages,prepareMainSchema,verifyOriginalBackendAudit,verifyOriginalApplicationSast,verifyOriginalQualification,verifyFollowRedirectsPatchOnly,verifyOriginalFrontendAudit,nativeTrainingFixtureSql,nativeTrainingFactsSql,nativeTeacherFixtureSql,nativeTeacherFactsSql} from './personal-tracking-ready.mjs';
import {changedEntries} from './content-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const options={event:'pull_request',branch:binding.branch,draft:false};
test('original local cases and failed continuations retain their provenance without replay',async()=>{
 const result=await admitOriginalReports();assert.equal(result.caseCount,binding.originalCaseCount??31);assert.equal(result.ciExecuted,false);
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
 const needs={scope:{result:'success',outputs},'personal-tracking':{result:'success'},docker:{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','personal-tracking',...(plan.imageReuse?[]:['docker']),'codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 for(const key of ['personal-tracking',...(plan.imageReuse?[]:['docker']),'codeql'])assert(failedChecks({...needs,[key]:{result:'skipped'}},false).includes(key));
 assert(failedChecks(needs,true).includes('scope'));
});

test('actual entrypoint child resolves original admission without a top-level-await cycle',()=>{
 const result=admitOriginalReportsInChild();assert.equal(result.caseCount,binding.originalCaseCount??31);assert.equal(result.ciExecuted,false);
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

test('actual main schema archive exceeds 1 MiB without stdout buffer truncation',()=>{
 const temporary=mkdtempSync(resolve(tmpdir(),'personal-archive-test-'));
 try{const schema=prepareMainSchema(temporary);assert(statSync(resolve(temporary,'main-schema.tar')).size>1024*1024);assert.equal(readFileSync(schema,'utf8'),execFileSync('git',['show',binding.base+':server-version/backend/prisma/schema.prisma'],{encoding:'utf8'}));}finally{rmSync(temporary,{recursive:true,force:true});}
});

test('backend audit receipt cannot admit a failed or expired original audit step',async()=>{
 const plan=personalTrackingReadyPlan(changedEntries(binding.base,head),binding.base,head,options),proof=binding.backendAuditReuse,now=Date.now(),old=process.env.GH_TOKEN;process.env.GH_TOKEN='synthetic-metadata-test-only';
 const job={id:proof.jobId,run_id:proof.runId,head_sha:proof.sourceHead,status:'completed',conclusion:'failure',steps:[{name:proof.step,conclusion:'success',completed_at:new Date(now).toISOString()}]};const fake=value=>async()=>({ok:true,json:async()=>value});
 try{assert.equal((await verifyOriginalBackendAudit(plan,fake(job),now)).reexecuted,false);await assert.rejects(verifyOriginalBackendAudit(plan,fake({...job,steps:[{...job.steps[0],conclusion:'failure'}]}),now));await assert.rejects(verifyOriginalBackendAudit(plan,fake({...job,steps:[{...job.steps[0],completed_at:new Date(now-25*3600000).toISOString()}]}),now));}finally{if(old===undefined)delete process.env.GH_TOKEN;else process.env.GH_TOKEN=old;}
});


test('retained application SAST requires exact official successful extraction and current tree',async()=>{
 const plan=personalTrackingReadyPlan(changedEntries(binding.base,head),binding.base,head,options),proof=binding.applicationSastReuse,now=Date.now(),old=process.env.GH_TOKEN;process.env.GH_TOKEN='synthetic-read-only-metadata';
 if(!proof){try{await assert.rejects(verifyOriginalApplicationSast({...plan,applicationSastReuse:binding.historicalMain318ApplicationSastReuse}));return;}finally{if(old===undefined)delete process.env.GH_TOKEN;else process.env.GH_TOKEN=old;}}
 const job={id:proof.jobId,run_id:proof.runId,head_sha:proof.executionHead,name:'codeql (javascript/typescript SAST)',status:'completed',conclusion:'success',completed_at:new Date(now).toISOString(),steps:['bound personal tracking SAST without extending the inline expression','initialize CodeQL','analyze with CodeQL'].map(name=>({name,conclusion:'success'}))};const fake=value=>async()=>({ok:true,json:async()=>value});
 try{assert.equal((await verifyOriginalApplicationSast(plan,fake(job),now)).reexecuted,false);await assert.rejects(verifyOriginalApplicationSast(plan,fake({...job,conclusion:'failure'}),now));await assert.rejects(verifyOriginalApplicationSast(plan,fake({...job,steps:[]}),now));await assert.rejects(verifyOriginalApplicationSast(plan,fake({...job,head_sha:'0'.repeat(40)}),now));await assert.rejects(verifyOriginalApplicationSast(plan,fake({...job,completed_at:new Date(now-25*3600000).toISOString()}),now));}finally{if(old===undefined)delete process.env.GH_TOKEN;else process.env.GH_TOKEN=old;}
});


test('actual original source-SHA job metadata admits only its unchanged qualification scope',async()=>{
 const plan=personalTrackingReadyPlan(changedEntries(binding.base,head),binding.base,head,options),old=process.env.GH_TOKEN;process.env.GH_TOKEN='synthetic-offline-metadata-reader';
 const prefix='docs/evidence/personal-longitudinal-20261030/continuation/',sast=JSON.parse(readFileSync(prefix+(binding.applicationSastReuse?.sourceHead==='52b4cbdb4463a7ffcaf5192cc577a6d4d71774dc'?'personal-main28-codeql-success.json':'personal-ready-af8-codeql-success.json'))),native=JSON.parse(readFileSync(binding.qualificationReuse?.sourceHead==='1170ac40728191631be07330bc8d58712339de34'?'docs/evidence/personal-longitudinal-teacher-20261030/continuation/teacher-ready-original-native-success.json':prefix+'personal-ready-e658-native-success.json'));
 const read=job=>async()=>({ok:true,json:async()=>job});
 try{
  if(binding.applicationSastReuse){assert.equal(sast.head_sha,binding.applicationSastReuse.sourceHead);assert.equal((await verifyOriginalApplicationSast(plan,read(sast))).reexecuted,false);}else await assert.rejects(verifyOriginalApplicationSast({...plan,applicationSastReuse:binding.historicalMain318ApplicationSastReuse},read(sast)));
  if(!binding.qualificationReuse){await assert.rejects(verifyOriginalQualification({...plan,qualificationReuse:binding.previousSliceQualification},read(native)));return;}
  const admitted=await verifyOriginalQualification(plan,read(native));assert.equal(admitted.reexecuted,false);assert.equal(admitted.status,binding.qualificationReuse.nativeOnly?'ADMITTED_NATIVE_QUALIFICATION_ONLY':'ADMITTED_COMPLETE_NATIVE_FRONTEND_QUALIFICATION');
  await assert.rejects(verifyOriginalQualification(plan,read({...native,conclusion:'failure'})));
  await assert.rejects(verifyOriginalQualification(plan,read({...native,steps:[]})));
  await assert.rejects(verifyOriginalQualification({...plan,qualificationReuse:{...plan.qualificationReuse,serverVersionTree:'0'.repeat(40)}},read(native)));
 }finally{if(old===undefined)delete process.env.GH_TOKEN;else process.env.GH_TOKEN=old;}
});

test('Training source-line deltas remain exact and old schema qualification cannot admit a new migration',()=>{
 if(binding.slice!=='training')return;
 const plan=personalTrackingReadyPlan(changedEntries(binding.base,head),binding.base,head,options);
 assert(!plan.qualificationReuse);assert(!plan.imageReuse);assert(!plan.applicationSastReuse);
 assert(plan.sastPaths.includes('server-version/backend/src/modules/composite/personal-tracking.ts'));
 assert(plan.frontendLintPaths.includes('src/modules/composite/TrainingPersonalChanges.tsx'));
 const path='server-version/backend/src/modules/composite/personal-tracking-results.ts',old=binding.files[path].originalDeltaSHA256;
 try{binding.files[path].originalDeltaSHA256='0'.repeat(64);assert.throws(()=>personalTrackingReadyPlan(changedEntries(binding.base,head),binding.base,head,options),/Original longitudinal delta changed/);}finally{binding.files[path].originalDeltaSHA256=old;}
});
test('frontend audit admission requires the exact successful unexpired original step',async()=>{
 if(!binding.frontendAuditReuse)return;
 const plan=personalTrackingReadyPlan(changedEntries(binding.base,head),binding.base,head,options),p=binding.frontendAuditReuse,old=process.env.GH_TOKEN;process.env.GH_TOKEN='synthetic-offline-audit-metadata';const now=Date.now();
 const job={run_id:p.runId,head_sha:p.sourceHead,status:'completed',conclusion:'success',steps:[{name:p.step,conclusion:'success',completed_at:new Date(now).toISOString()}]},read=value=>async()=>({ok:true,json:async()=>value});
 try{assert.equal((await verifyOriginalFrontendAudit(plan,read(job),now)).reexecuted,false);await assert.rejects(verifyOriginalFrontendAudit(plan,read({...job,steps:[{...job.steps[0],conclusion:'failure'}]}),now));await assert.rejects(verifyOriginalFrontendAudit(plan,read({...job,steps:[{...job.steps[0],completed_at:new Date(now-25*3600000).toISOString()}]}),now));}finally{if(old===undefined)delete process.env.GH_TOKEN;else process.env.GH_TOKEN=old;}
});
test('Training native fixture targets real old publication/report fields without application or new-column writes',()=>{
 const q=nativeTrainingFixtureSql({owner:'owner',id:'old',trackingId:'new',attempt:'attempt'});assert(q.includes('synthetic-opaque-old-report'));assert(q.includes("'COMPLETED'"));assert(!q.includes('personal_tracking'));assert(!q.includes('personal_changes_snapshots'));
 assert(nativeTrainingFactsSql('old','attempt').includes("to_jsonb(a)-'personal_changes_snapshots'"));
});

test('Teacher native qualification preserves original failed reporters and refuses altered fourteen-file deltas',async()=>{
 if(binding.slice!=='teacher')return;
 const entries=changedEntries(binding.base,head),plan=personalTrackingReadyPlan(entries,binding.base,head,options),originals=await admitOriginalReports();
 assert.equal(Object.keys(binding.files).length,14);assert.equal(originals.caseCount,4);assert.equal(originals.historicalFailures.length,2);assert(originals.historicalFailures.every(f=>f.status==='ORIGINAL_FAILURE_RETAINED'));
 const failed=binding.historicalFailures[0];await assert.rejects(admitOriginalReports(file=>file===failed.file?Buffer.from('{}'):readFileSync(file)),/Original failed reporter changed/);
 assert(!plan.qualificationReuse||plan.qualificationReuse.nativeOnly);assert(!plan.imageReuse);assert(plan.sastPaths.includes('server-version/backend/src/modules/reporting/teacher-personal-changes.service.ts'));assert(plan.frontendLintPaths.includes('src/huiteacher/TeacherPersonalTracking.tsx'));
 const pin=binding.files['server-version/backend/src/modules/reporting/education-personal-tracking.ts'],original=pin.originalDeltaSHA256;
 try{pin.originalDeltaSHA256='0'.repeat(64);assert.throws(()=>personalTrackingReadyPlan(entries,binding.base,head,options),/Original longitudinal delta changed/);}finally{pin.originalDeltaSHA256=original;}
 const sql=nativeTeacherFixtureSql({owner:'owner',id:'old',trackingId:'draft',attempt:'attempt',organization:'org',membership:'member',track:'track',actor:'actor',relationship:'self',digest:'a'.repeat(64)});
 assert(sql.includes("'COMPLETED'"));assert(sql.includes('assessment_run_relationship_snapshots'));assert(!sql.includes('personal_tracking'));assert(!sql.includes('personal_changes_snapshots'));assert(nativeTeacherFactsSql('old','attempt').includes("to_jsonb(e)-'personal_changes_snapshots'"));
});

test('Teacher native-only reuse authenticates the original migration without claiming old frontend for a changed production tree',async()=>{
 if(binding.slice!=='teacher'||!binding.qualificationReuse?.nativeOnly)return;
 const plan=personalTrackingReadyPlan(changedEntries(binding.base,head),binding.base,head,options),old=process.env.GH_TOKEN;process.env.GH_TOKEN='synthetic-offline-exact-native-reader';
 const original=JSON.parse(readFileSync('docs/evidence/personal-longitudinal-teacher-20261030/continuation/teacher-ready-original-native-success.json')),read=value=>async()=>({ok:true,json:async()=>value});
 try{
  const admitted=await verifyOriginalQualification(plan,read(original));assert.equal(admitted.status,'ADMITTED_NATIVE_QUALIFICATION_ONLY');assert.equal(admitted.frontendAdmitted,false);assert.equal(admitted.reexecuted,false);
  for(const name of ['admit exact original local reporters without application replay','install locked native migration tools','real nonempty main upgrade and native dump restore'])await assert.rejects(verifyOriginalQualification(plan,read({...original,steps:original.steps.map(s=>s.name===name?{...s,conclusion:'skipped'}:s)})),/Original qualification step missing or failed/);
  await assert.rejects(verifyOriginalQualification(plan,read({...original,conclusion:'failure'})));
  await assert.rejects(verifyOriginalQualification(plan,read({...original,completed_at:new Date(Date.now()-25*3600000).toISOString()})),/expired/);
 }finally{if(old===undefined)delete process.env.GH_TOKEN;else process.env.GH_TOKEN=old;}
});

test('School exact source admission retains37 observations and all12 failed reporters without replay',async()=>{
 if(binding.slice!=='school')return;
 const originals=await admitOriginalReports();assert.equal(originals.caseCount,37);assert.equal(originals.admitted.length,18);assert.equal(originals.historicalFailures.length,12);assert.equal(originals.ciExecuted,false);
 const item=binding.historicalFailures[0],old=item.continuations[0].successfulReportId;
 try{item.continuations[0].successfulReportId='missing-successful-case';await assert.rejects(admitOriginalReports(),/Retained-state continuation missing/);}finally{item.continuations[0].successfulReportId=old;}
});
test('School candidate-state native reuse refuses a different Prisma baseline, failed migration or expired official producer',async()=>{
 if(binding.slice!=='school')return;
 const plan=personalTrackingReadyPlan(changedEntries(binding.base,head),binding.base,head,options),original=JSON.parse(readFileSync('docs/evidence/personal-longitudinal-teacher-20261030/continuation/teacher-ready-original-native-success.json')),old=process.env.GH_TOKEN,base=binding.base;process.env.GH_TOKEN='synthetic-exact-native-state-metadata';const read=value=>async()=>({ok:true,json:async()=>value});
 try{
  const admitted=await verifyOriginalQualification(plan,read(original));assert.equal(admitted.status,'ADMITTED_NATIVE_QUALIFICATION_ONLY');assert.equal(admitted.candidateAsBaseline,true);assert.equal(admitted.frontendAdmitted,false);assert.equal(admitted.reexecuted,false);
  binding.base='43d119c9bfbc7949baab2edea29d96044b04607c';await assert.rejects(verifyOriginalQualification(plan,read(original)),/Qualified candidate state differs from current base/);binding.base=base;
  await assert.rejects(verifyOriginalQualification(plan,read({...original,steps:original.steps.map(s=>s.name==='real nonempty main upgrade and native dump restore'?{...s,conclusion:'skipped'}:s)})),/Original qualification step missing or failed/);
  await assert.rejects(verifyOriginalQualification(plan,read({...original,completed_at:new Date(Date.now()-25*3600000).toISOString()})),/expired/);
 }finally{binding.base=base;if(old===undefined)delete process.env.GH_TOKEN;else process.env.GH_TOKEN=old;}
});
test('School fixed55 source deltas include native quota controls and reject a changed implementation',()=>{
 if(binding.slice!=='school')return;
 const entries=changedEntries(binding.base,head),plan=personalTrackingReadyPlan(entries,binding.base,head,options);assert.equal(Object.keys(binding.files).length,55);assert(plan.qualificationReuse.nativeOnly&&plan.qualificationReuse.candidateAsBaseline);assert(!plan.imageReuse&&!plan.applicationSastReuse);
 assert(plan.sastPaths.some(p=>p.endsWith('/native-source.cognitive.ts')));assert(plan.frontendLintPaths.includes('src/school/SchoolStudentTasks.tsx'));
 const pin=binding.files['server-version/backend/src/modules/campus/report.routes.ts'],old=pin.originalDeltaSHA256;
 try{pin.originalDeltaSHA256='0'.repeat(64);assert.throws(()=>personalTrackingReadyPlan(entries,binding.base,head,options),/Original longitudinal delta changed/);}finally{pin.originalDeltaSHA256=old;}
});

test('group longitudinal Ready preserves exact inventory, existing gates and original failures without replay',{skip:binding.slice!=='group'},async()=>{
 const entries=changedEntries(binding.base,head),plan=personalTrackingReadyPlan(entries,binding.base,head,options);
 assert.deepEqual(plan.required,['scope','personal-tracking','docker','codeql']);
 assert.equal(plan.branch,binding.branch);assert(plan.frontendLintPaths.length);assert(plan.sastPaths.includes('.github/scripts/personal-tracking-ready.mjs'));
 const original=await admitOriginalReports();assert.equal(original.caseCount,binding.originalCaseCount);assert.equal(original.ciExecuted,false);
 for(const patch of [{forceFull:true},{branch:'other'},{event:'workflow_dispatch'}]){
  if(patch.forceFull)assert.throws(()=>personalTrackingReadyPlan(entries,binding.base,head,{...options,...patch}));
  else assert.equal(personalTrackingReadyPlan(entries,binding.base,head,{...options,...patch}),null);
 }
 assert.throws(()=>personalTrackingReadyPlan(entries,'a'.repeat(40),head,options));
 assert.throws(()=>personalTrackingReadyPlan([...entries,{file:'server-version/backend/src/unreviewed.ts',newMode:'100644',oldMode:'000000',status:'A'}],binding.base,head,options));
 assert.throws(()=>personalTrackingReadyPlan(entries.map((e,i)=>i?e:{...e,newMode:'120000'}),binding.base,head,options));
});


test('group single patched HTTP dependency preserves native and frontend qualification while rejecting other drift',{skip:!binding.qualificationReuse?.followRedirectsPatchOnly},async()=>{
 const proof=binding.qualificationReuse,from=path=>JSON.parse(execFileSync('git',['show',proof.sourceHead+':'+path],{encoding:'utf8'}));
 const before=from('server-version/backend/package.json'),lock=from('server-version/backend/package-lock.json'),after=JSON.parse(readFileSync('server-version/backend/package.json')),next=JSON.parse(readFileSync('server-version/backend/package-lock.json'));
 assert.equal(verifyFollowRedirectsPatchOnly(before,lock,after,next).prismaDependencyGraphUnchanged,true);
 const changed=structuredClone(next);changed.packages['node_modules/prisma'].version='0.0.0';assert.throws(()=>verifyFollowRedirectsPatchOnly(before,lock,after,changed));
 const manifest=structuredClone(after);manifest.engines.node='>=99';assert.throws(()=>verifyFollowRedirectsPatchOnly(before,lock,manifest,next));
 const original=JSON.parse(readFileSync('docs/evidence/group-longitudinal-survey-training-20261030/qualification/follow-redirects-1162/original-qualification-job.json'));
 const fetcher=job=>async()=>({ok:true,json:async()=>job});
 const admitted=await verifyOriginalQualification({qualificationReuse:proof},fetcher(original));assert.equal(admitted.frontendAdmitted,true);assert.equal(admitted.reexecuted,false);
 await assert.rejects(verifyOriginalQualification({qualificationReuse:proof},fetcher({...original,conclusion:'failure'})));
 await assert.rejects(verifyOriginalQualification({qualificationReuse:proof},fetcher({...original,steps:original.steps.filter(s=>s.name!=='real nonempty main upgrade and native dump restore')})));
});

test('Teacher group uses the existing scoped route: Draft scope only, Ready existing migration/images/SAST',async()=>{
 if(binding.branch!=='feat/teacher-group-longitudinal-20261031')return;
 const entries=changedEntries(binding.base,head),ready=personalTrackingReadyPlan(entries,binding.base,head,{event:'pull_request',branch:binding.branch,draft:false});
 assert.deepEqual(ready.required,['scope','personal-tracking','docker','codeql']);
 assert.deepEqual(personalTrackingReadyPlan(entries,binding.base,head,{event:'pull_request',branch:binding.branch,draft:true}).required,['scope']);
 assert.throws(()=>personalTrackingReadyPlan([...entries,{file:'server-version/backend/src/modules/auth/unknown.ts',status:'A',oldMode:'000000',newMode:'100644'}],binding.base,head,{event:'pull_request',branch:binding.branch,draft:false}));
 assert.throws(()=>personalTrackingReadyPlan(entries,'0'.repeat(40),head,{event:'pull_request',branch:binding.branch,draft:false}));
 const evidence=await admitOriginalReports();assert.equal(evidence.caseCount,11);assert.equal(evidence.ciExecuted,false);
});
