import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {binding,bindingPath,scaleLibraryGovernancePlan,scaleLibraryGovernanceOutputs} from './scale-library-governance-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const head='1'.repeat(40),entry=file=>{const added=file===bindingPath||binding.source[file]?.before===null;return {file,status:added?'A':'M',oldMode:added?'000000':'100644',newMode:'100644'}};
const rows=[bindingPath,...Object.keys(binding.source)].map(entry);
const read=(op,value)=>{const i=value.indexOf(':');return binding.source[value.slice(i+1)][value.slice(0,i)===binding.base?'before':'after'];};
test('only exact governance product blobs and ordinary modes enter; unknown input is refused',()=>{
 const p=scaleLibraryGovernancePlan(rows,binding.base,head,read);assert.equal(p.route,'scale-library-governance');
 for(const path of ['server-version/backend/package-lock.json','server-version/backend/src/workers/exportBatchTask.ts','server-version/frontend/src/main.tsx'])assert.throws(()=>scaleLibraryGovernancePlan([...rows,entry(path)],binding.base,head,read));
 assert.throws(()=>scaleLibraryGovernancePlan(rows,'2'.repeat(40),head,read));
 assert.throws(()=>scaleLibraryGovernancePlan([...rows,rows[0]],binding.base,head,read));
 assert.throws(()=>scaleLibraryGovernancePlan([rows[0]],binding.base,head,read));
 assert.throws(()=>scaleLibraryGovernancePlan(rows,binding.base,head,()=> '3'.repeat(40)));
 for(const newMode of ['120000','100755','000000'])assert.throws(()=>scaleLibraryGovernancePlan([{...rows[0],newMode},...rows.slice(1)],binding.base,head,read));
});
test('all selected actual jobs must succeed, with no application/full fallback',()=>{
 const p=scaleLibraryGovernancePlan(rows,binding.base,head,read),outputs=Object.fromEntries(Object.entries(scaleLibraryGovernanceOutputs(p)).map(([k,v])=>[k,String(v)]));
 const n={scope:{result:'success',outputs},'scale-library-governance':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(n,false),['scope','scale-library-governance','codeql']);assert.deepEqual(failedChecks(n,false),[]);
 for(const job of requiredChecks(n,false))for(const result of ['failure','skipped','cancelled',undefined])assert(failedChecks({...n,[job]:{...n[job],result}},false).includes(job));
 assert(failedChecks(n,true).includes('scope'));
});
test('same-builder checks, real PG recovery, isolated media and private cleanup remain required',()=>{
 const w=readFileSync(new URL('../workflows/ci-scale-library-governance.yml',import.meta.url),'utf8');
 assert.match(w,/scale-library-governance-build.sh/);assert.match(w,/--severity HIGH,CRITICAL/);
 assert.match(w,/recovery.py bootstrap/);assert.match(w,/recovery.py restore/);
 assert.match(w,/backend.sh once node .*checks.mjs.* postgres/);
 assert.match(w,/backend.sh worker/);assert.match(w,/NET_BIND_SERVICE/);
 assert.doesNotMatch(w,/ignoreHTTPSErrors|--ignore-certificate-errors|\/etc\/hosts|update-ca-certificates/);
 assert.match(w,/if: always\(\)/);assert.match(w,/privateMaterialRemoved/);
 const build=readFileSync(new URL('./scale-library-governance-build.sh',import.meta.url),'utf8');
 assert.match(build,/set -euo pipefail/);assert.match(build,/docker save/);assert.match(build,/runtime-files.sha256/);
 const recovery=readFileSync(new URL('./scale-library-governance-recovery.py',import.meta.url),'utf8');
 assert.match(recovery,/pg_dump/);assert.match(recovery,/pg_restore/);assert.match(recovery,/assert before==after/);
 assert.match(recovery,/PG contracts must create actual new-schema evidence/);
});

test('manual and forced platform requests cannot reinterpret this frozen candidate',()=>{
 const old={event:process.env.CI_EVENT,force:process.env.CI_FORCE_FULL};
 try{
  process.env.CI_EVENT='workflow_dispatch';assert.throws(()=>scaleLibraryGovernancePlan(rows,binding.base,head,read));
  process.env.CI_EVENT='pull_request';process.env.CI_FORCE_FULL='true';assert.throws(()=>scaleLibraryGovernancePlan(rows,binding.base,head,read));
 }finally{
  if(old.event===undefined)delete process.env.CI_EVENT;else process.env.CI_EVENT=old.event;
  if(old.force===undefined)delete process.env.CI_FORCE_FULL;else process.env.CI_FORCE_FULL=old.force;
 }
 const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 for(const block of ci.split(/\n  (?=probe-)/).slice(1))assert.match(block.split(/\n  [a-z]/)[0],/work\/scale-library-governance-20261021/);
 assert.match(ci,/needs: \[scope, scale-library-governance,/);
});

test('browser admission refuses missing checkpoints, media bytes, wrong provenance and false green summaries',async()=>{
 const {verifyGovernanceBrowserReport,requiredGovernanceChecks}=await import('./scale-library-governance-scope.mjs');
 const names=['training-all-at-once','survey-shared-scale-report','library-governance'];
 const image={sourceKind:'blob',complete:true,naturalWidth:16,naturalHeight:16,byteLength:103,contentType:'image/png',sha256:'f152348704ab15cbdb0c57d769e0541c42100dccf86572485b8b912b248d33b3',signature:[137,80,78,71,13,10,26,10]};
 const video={status:206,contentType:'video/mp4',contentRange:'bytes 0-1023/4096',byteLength:1024,currentTime:.1,videoWidth:160,videoHeight:120};
 const r={schemaVersion:1,status:'PASS',phase:'complete',sourceCommit:head,ciRunId:'123',checks:requiredGovernanceChecks,browserErrors:[],blockedExternalRequests:0,physicalSecurityKeyVerified:false,
 screenshots:names.flatMap(name=>[1440,390].map(width=>({name,width,file:`${name}-${width}.png` }))),layoutChecks:names.flatMap(name=>[1440,390].map(width=>({name,width,overflow:false}))),accessibility:names.map(name=>({name,passes:1,violations:[]})),
 catalog:{standardVisible:true,authoredVisible:true,paginationUnique:true,approvedIdentitiesMatched:2},lifecycle:{newRevisionDistinct:true,ordinaryRevocationFrozenFinalPassed:true,emergencyNewAdmissionStatus:409,previousFinalReplayStatus:200,sameReceipt:true},
 journeys:[{name:'training-to-survey',finalAnswerCount:3,typedAnswersPreserved:true,contentScore:1,qualityItemsExcluded:2,exactApprovedRelease:true,reportImageExact:true},{name:'survey-to-training',allAtOnce:true,finalAnswerCount:3,contentScore:1,qualityItemsExcluded:2,exactApprovedRelease:true,reportImageExact:true}],
 media:[{name:'real-video-worker',status:'COMPLETED',originalUploadSha256:'a'.repeat(64),processedSha256:'b'.repeat(64),processedBytes:4096},...['review-image','review-image','survey-question-image','survey-frozen-report-image','training-parent-report-image'].map(name=>({name,...image})),{name:'review-video',capabilityMaxSeconds:60,...video},{name:'survey-runtime-video',capabilityMaxSeconds:600,ended:true,...video}]};
 // Synthetic validator fixture only, never an application or screenshot result.
 const options={head,runId:'123',directory:'/evidence',read:file=>{const png=Buffer.alloc(128);Buffer.from(image.signature).copy(png);png.writeUInt32BE(Number(file.match(/-(\d+)\.png$/)[1]),16);png.writeUInt32BE(1000,20);return png;}};
 assert.equal(verifyGovernanceBrowserReport(r,options).status,'PASS');
 for(const mutate of [r=>r.status='FAIL',r=>r.sourceCommit='2'.repeat(40),r=>r.checks.pop(),r=>r.layoutChecks[0].overflow=true,r=>r.accessibility[0].violations.push({id:'color-contrast'}),r=>r.media[1].sha256='c'.repeat(64),r=>r.media.at(-1).ended=false,r=>r.journeys[1].allAtOnce=false,r=>r.physicalSecurityKeyVerified=true,r=>r.screenshots[0].file='../private.json',r=>r.lifecycle.sameReceipt=false]){const invalid=structuredClone(r);mutate(invalid);assert.throws(()=>verifyGovernanceBrowserReport(invalid,options));}
 assert.throws(()=>verifyGovernanceBrowserReport(r,{...options,read:()=>Buffer.from('not PNG')}));
});

test('SQL repair continuation compiles only backend and accepts frontend without repeating qualification',()=>{
 const w=readFileSync(new URL('../workflows/ci-scale-library-governance.yml',import.meta.url),'utf8');
 assert.match(w,/component: \[backend\]/);assert.doesNotMatch(w,/component: \[backend, frontend\]/);
 assert.match(w,/scale-library-governance-build.sh backend/);
 assert.match(w,/resume.py qualified-frontend/);assert.match(w,/resume.py round3 backend/);assert.match(w,/resume.py round3 postgres/);
 assert.doesNotMatch(w,/checks.mjs.*(?:backend|frontend)/);
 const reuse=readFileSync(new URL('./scale-library-governance-resume.py',import.meta.url),'utf8');
 assert.doesNotMatch(reuse,/docker['", ]+build|npm ci|docker['", ]+tag/);
 assert.match(reuse,/org.opencontainers.image.revision/);assert.match(reuse,/originalJobConclusion.*failure/);
});

test('official continuation requires the exact failed producer and successful build step',async()=>{
 const {execFileSync}=await import('node:child_process');
 execFileSync('python3',['-B','-c',`
import importlib.util,copy
spec=importlib.util.spec_from_file_location('resume','.github/scripts/scale-library-governance-resume.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
run={'id':m.RUN,'head_sha':m.SOURCE,'run_attempt':1,'status':'completed','conclusion':'failure'}
job={'id':119241598178,'run_id':m.RUN,'head_sha':m.SOURCE,'run_attempt':1,'status':'completed','conclusion':'failure','steps':[{'name':n,'conclusion':'success'} for n in ['compile once and preserve exact builder and runtime bytes','verify prior official audit on the identical locked dependency inputs']]}
def read(path):return run if path.startswith('runs/') else job
m.official('frontend',read)
for field,value in [('head_sha','0'*40),('run_attempt',2),('conclusion','success')]:
 original=job[field];job[field]=value
 try:m.official('frontend',read)
 except AssertionError:pass
 else:raise AssertionError('invalid producer accepted')
 job[field]=original
for value in ['failure','skipped',None]:
 job['steps'][0]['conclusion']=value
 try:m.official('frontend',read)
 except AssertionError:pass
 else:raise AssertionError('missing original build success accepted')
job['id']=119241597740;job['conclusion']='success';m.official('sast',read)
`],{stdio:'pipe'});
});

test('partial failed-run reports admit only exact unchanged passing suites',async()=>{
 const {execFileSync}=await import('node:child_process');
 execFileSync('python3',['-B','-c',`
import importlib.util,copy
spec=importlib.util.spec_from_file_location('resume','.github/scripts/scale-library-governance-resume.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
p={'frontend':['src/unchanged.test.ts'],'originalInventory':{'frontend':['src/unchanged.test.ts','src/repaired.test.ts']}}
r={'success':False,'numFailedTests':4,'testResults':[{'name':'/app/src/unchanged.test.ts','status':'passed','assertionResults':[{'status':'passed'} for _ in range(159)]},{'name':'/app/src/repaired.test.ts','assertionResults':[{'status':'failed'}]}]}
assert m.validate_prior_report('frontend',r,p)[1]==159
for kind in ['failed','suite-failed','missing','false-green','duplicate']:
 bad=copy.deepcopy(r)
 if kind=='failed':bad['testResults'][0]['assertionResults'][0]['status']='failed'
 if kind=='suite-failed':bad['testResults'][0]['status']='failed'
 if kind=='missing':bad['testResults'].pop()
 if kind=='false-green':bad['success']=True
 if kind=='duplicate':bad['testResults'].append(copy.deepcopy(bad['testResults'][0]))
 try:m.validate_prior_report('frontend',bad,p)
 except AssertionError:pass
 else:raise AssertionError('invalid partial report accepted: '+kind)
`],{stdio:'pipe'});
});

test('SQL-only continuation rejects missing, pending and suite-level failed prior results',async()=>{
 const {execFileSync}=await import('node:child_process');
 execFileSync('python3',['-B','-c',`
import importlib.util,copy
spec=importlib.util.spec_from_file_location('resume','.github/scripts/scale-library-governance-resume.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
r={'success':True,'numFailedTests':0,'numPendingTests':0,'testResults':[{'name':'/app/src/test.ts','status':'passed','assertionResults':[{'status':'passed'}]}]}
assert m.passed_suites(r,['src/test.ts'],1,True)==[{'file':'src/test.ts','passed':1}]
for kind in ['suite','assertion','missing','pending']:
 bad=copy.deepcopy(r)
 if kind=='suite':bad['testResults'][0]['status']='failed'
 if kind=='assertion':bad['testResults'][0]['assertionResults'][0]['status']='failed'
 if kind=='missing':bad['testResults']=[]
 if kind=='pending':bad['numPendingTests']=1
 try:m.passed_suites(bad,['src/test.ts'],1,True)
 except (AssertionError,KeyError):pass
 else:raise AssertionError('invalid success accepted: '+kind)
`],{stdio:'pipe'});
});
