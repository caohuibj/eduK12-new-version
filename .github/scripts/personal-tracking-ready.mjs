import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {participantAccessOutputs} from './participant-access-scope.mjs';
import {personalTrackingDraftScope} from './personal-tracking-draft-scope.mjs';
export const binding=JSON.parse(readFileSync(new URL('./personal-tracking-ready.json',import.meta.url)));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function personalTrackingReadyPlan(entries,base,head,{event,branch,draft,forceFull=false}={}){
 if(branch!==binding.branch||event!=='pull_request')return null;
 assert.equal(forceFull,false,'Personal tracking does not authorize whole-platform execution');
 assert.equal(base,binding.base,'Personal tracking main base changed; recheck affected inputs');
 assert.equal(binding.reviewedCandidate,'a62c9a5763da69aa13b4f70d062b0bf55d6db65f');
 assert(personalTrackingDraftScope(entries,{event,draft:true}));
 for(const entry of entries.filter(e=>e.file.startsWith('server-version/'))){
  const pin=binding.files[entry.file];assert(pin,'Unreviewed application input: '+entry.file);
  assert.equal(git('rev-parse',head+':'+entry.file),pin.after);
  assert.equal(pin.after,git('rev-parse',binding.reviewedCandidate+':'+entry.file),'Application differs from reviewed source');
  if(pin.before){assert.equal(entry.status,'M');assert.equal(git('rev-parse',base+':'+entry.file),pin.before)}else assert.equal(entry.status,'A');
 }
 assert.deepEqual(entries.filter(e=>e.file.startsWith('server-version/')).map(e=>e.file).sort(),Object.keys(binding.files).sort());
 for(const [file,blob]of Object.entries(binding.protectedInputs))assert.equal(git('rev-parse',head+':'+file),blob,'Dependency/build input changed');
 if(binding.imageReuse){assert.equal(git('rev-parse',head+':server-version'),binding.imageReuse.serverVersionTree,'Image source tree changed');assert.equal(git('rev-parse',binding.imageReuse.sourceHead+':server-version'),binding.imageReuse.serverVersionTree);for(const [file,blob]of Object.entries(binding.imageReuse.inputs))assert.equal(git('rev-parse',head+':'+file),blob,'Original image producer input changed');}
 if(binding.applicationSastReuse)assert.equal(git('rev-parse',head+':server-version'),binding.applicationSastReuse.serverVersionTree,'Original SAST application input changed');
 if(binding.backendAuditReuse)for(const file of ['server-version/backend/package.json','server-version/backend/package-lock.json'])assert.equal(git('rev-parse',binding.backendAuditReuse.sourceHead+':'+file),git('rev-parse',head+':'+file),'Original backend audit input changed');
 return {schemaVersion:1,route:'personal-tracking',base,head,tree:git('rev-parse',head+'^{tree}'),draft:draft===true,reviewedCandidate:binding.reviewedCandidate,...(binding.imageReuse?{imageReuse:binding.imageReuse}:{}),...(binding.backendAuditReuse?{backendAuditReuse:binding.backendAuditReuse}:{}),...(binding.applicationSastReuse?{applicationSastReuse:binding.applicationSastReuse}:{}),...(binding.qualificationReuse?{qualificationReuse:binding.qualificationReuse}:{}),required:draft?['scope']:['scope','personal-tracking',...(binding.imageReuse?[]:['docker']),'codeql']};
}
export function personalTrackingReadyOutputs(plan){const out=participantAccessOutputs(plan);delete out.participant_access_plan;return {...out,application_route:'personal-tracking',scenario:'personal-tracking',codeql:!plan.draft,personal_tracking_plan:JSON.stringify(plan),personal_tracking_draft:false};}
export async function admitOriginalReports(read=readFileSync){
 // Reuse the existing unsigned original-report verifier. Original failures and
 // filtered rows are preserved; these cases are NOT claimed as CI executions.
 const {verifyOriginalReport,verifyFailureContinuations}=await import('./onboarding-checks.mjs');
 const admitted=[],unique=new Set(),original=new Set();
 for(const item of binding.reports){const bytes=read(item.file);assert.equal(hash(bytes),item.sha256,'Original reporter changed');assert.equal(hash(execFileSync('git',['show',binding.reviewedCandidate+':'+item.file])),item.sha256,'Reporter differs from reviewed immutable Git original');const report=JSON.parse(bytes);const caseNames=verifyOriginalReport(report,item.review,{allowDuplicateFiltered:true});for(const name of caseNames){unique.add(name);if(item.file.includes('/originals/'))original.add(name);}admitted.push({id:item.id,caseNames,ciExecuted:false,originalSigned:false,provenance:'reviewed-local-evidence'});}
 verifyFailureContinuations(binding.reports.map(r=>({...r.review,id:r.id})),admitted);
 assert.equal(original.size,31,'All 31 original successful cases must remain present');assert(unique.size>=31,'Missing original successful application coverage');
 return {reviewedCandidate:binding.reviewedCandidate,caseCount:unique.size,admitted,ciExecuted:false,reviewBasis:binding.reviewBasis};
}
/** Separate process avoids the CLI -> onboarding -> scope -> CLI top-level
 * await cycle; it uses the same original verifier, without application replay. */
export function admitOriginalReportsInChild(){
 const code="const {admitOriginalReports}=await import('./.github/scripts/personal-tracking-ready.mjs');process.stdout.write(JSON.stringify(await admitOriginalReports()));";
 return JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'}));
}
export async function verifyOriginalImages(plan,fetcher=fetch,now=Date.now(),expectedProof=binding.imageReuse){
 const proof=plan.imageReuse;assert(proof&&JSON.stringify(proof)===JSON.stringify(expectedProof));
 const token=process.env.GH_TOKEN;assert(token,'Existing Actions read token required');
 const get=async path=>{const response=await fetcher('https://api.github.com/repos/'+binding.repository+path,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});assert(response.ok,'Official image metadata inaccessible: '+response.status);return response.json()};
 const run=await get('/actions/runs/'+proof.runId),job=await get('/actions/jobs/'+proof.jobId);
 assert.equal(run.head_sha,proof.sourceHead);assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');
 assert.equal(job.run_id,proof.runId);assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 assert([proof.sourceHead,proof.executionHead].includes(job.head_sha),'Image execution source changed');
 assert.equal(job.name,'docker (compose config + production builds) / production image build and scan');
 const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=-300000&&age<=proof.maximumAgeHours*3600000,'Original image check expired');
 const steps=['validate compose','assert prelaunch resource and HTTPS contract','assert API/worker isolation topology','validate monitoring compose','build production images','verify production Nginx static asset MIME and security headers','scan backend image (high and critical)','scan frontend image (high and critical)'];
 for(const name of steps)assert.equal(job.steps.find(step=>step.name===name)?.conclusion,'success','Original required image step did not pass: '+name);
 return {status:'ADMITTED_IMAGE_CHECKS_ONLY',runId:run.id,originalRunConclusion:run.conclusion,jobId:job.id,sourceHead:run.head_sha,executionHead:job.head_sha,completedAt:job.completed_at,serverVersionTree:proof.serverVersionTree,requiredSteps:steps,ciExecutedInOriginalRun:true,reexecuted:false,deployableArchiveAvailable:false};
}
export async function verifyOriginalBackendAudit(plan,fetcher=fetch,now=Date.now()){
 const proof=plan.backendAuditReuse;assert(proof&&JSON.stringify(proof)===JSON.stringify(binding.backendAuditReuse));assert(process.env.GH_TOKEN);
 const response=await fetcher('https://api.github.com/repos/'+binding.repository+'/actions/jobs/'+proof.jobId,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'}});assert(response.ok,'Official audit metadata unavailable');const job=await response.json();
 assert.equal(job.run_id,proof.runId);assert([proof.sourceHead,proof.executionHead].includes(job.head_sha));assert.equal(job.status,'completed');
 const matches=job.steps.filter(step=>step.name===proof.step);assert.equal(matches.length,1);const step=matches[0];assert.equal(step.conclusion,'success','Original locked backend audit did not pass');
 const age=now-Date.parse(step.completed_at);assert(Number.isFinite(age)&&age>=-300000&&age<=proof.maximumAgeHours*3600000,'Original locked audit expired');
 const originalWorkflow=execFileSync('git',['show',proof.sourceHead+':.github/workflows/ci.yml'],{encoding:'utf8'});const block=originalWorkflow.slice(originalWorkflow.indexOf('- name: '+proof.step),originalWorkflow.indexOf('- name: real nonempty main upgrade'));assert(block.includes('npm audit --audit-level=high'),'Original audit threshold changed');
 return {status:'ADMITTED_BACKEND_AUDIT_ONLY',runId:proof.runId,jobId:job.id,sourceHead:proof.sourceHead,originalJobConclusion:job.conclusion,step:proof.step,completedAt:step.completed_at,ciExecutedInOriginalRun:true,reexecuted:false};
}
/** The original complete application extraction is retained. Changed controls
 * are still analyzed by the current CodeQL job; findings are not disposed here. */
export async function verifyOriginalApplicationSast(plan,fetcher=fetch,now=Date.now()){
 const proof=plan.applicationSastReuse;assert(proof&&JSON.stringify(proof)===JSON.stringify(binding.applicationSastReuse));assert(process.env.GH_TOKEN);
 assert.equal(git('rev-parse','HEAD:server-version'),proof.serverVersionTree);
 assert.equal(git('rev-parse',proof.sourceHead+':server-version'),proof.serverVersionTree);
 const response=await fetcher('https://api.github.com/repos/'+binding.repository+'/actions/jobs/'+proof.jobId,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'}});assert(response.ok,'Official original SAST metadata inaccessible');const job=await response.json();
 assert.equal(job.run_id,proof.runId);assert([proof.sourceHead,proof.executionHead].includes(job.head_sha),'Original SAST source differs');assert.equal(job.name,'codeql (javascript/typescript SAST)');assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=-300000&&age<=proof.maximumAgeHours*3600000,'Original application SAST expired');
 for(const name of ['bound personal tracking SAST without extending the inline expression','initialize CodeQL','analyze with CodeQL'])assert.equal(job.steps.find(s=>s.name===name)?.conclusion,'success','Original application SAST step failed');
 const original=execFileSync('git',['show',proof.sourceHead+':.github/workflows/ci.yml'],{encoding:'utf8'});for(const path of proof.paths)assert(original.includes("'"+path+"'"),'Original extraction path missing');
 return {status:'ADMITTED_APPLICATION_SAST_ONLY',runId:proof.runId,jobId:proof.jobId,sourceHead:proof.sourceHead,executionHead:proof.executionHead,serverVersionTree:proof.serverVersionTree,paths:proof.paths,reexecuted:false,findingsDispositionChanged:false};
}
function nativeSourceInput(source){return source.slice(source.indexOf('\nexport function prepareMainSchema('),source.lastIndexOf("\nif(process.argv[1]"));}
function qualificationJobInput(workflow){return workflow.slice(workflow.indexOf('  personal-tracking:\n'),workflow.indexOf('  merge-gate:\n')).split('\n').filter(line=>!line.includes("if: ${{ !fromJSON(needs.scope.outputs.personal_tracking_plan || '{}').qualificationReuse }}")).join('\n');}
export async function verifyOriginalQualification(plan,fetcher=fetch,now=Date.now()){
 const proof=plan.qualificationReuse;assert(proof&&JSON.stringify(proof)===JSON.stringify(binding.qualificationReuse));assert(process.env.GH_TOKEN);
 assert.equal(git('rev-parse','HEAD:server-version'),proof.serverVersionTree);assert.equal(git('rev-parse',proof.sourceHead+':server-version'),proof.serverVersionTree);
 const original=execFileSync('git',['show',proof.sourceHead+':.github/scripts/personal-tracking-ready.mjs'],{encoding:'utf8'}),current=readFileSync(new URL(import.meta.url),'utf8');
 assert.equal(nativeSourceInput(current),nativeSourceInput(original),'Native qualification code changed');
 const originalBinding=JSON.parse(execFileSync('git',['show',proof.sourceHead+':.github/scripts/personal-tracking-ready.json'],{encoding:'utf8'}));assert.equal(binding.base,originalBinding.base,'Original native main schema changed');
 const workflow=readFileSync('.github/workflows/ci.yml','utf8'),originalWorkflow=execFileSync('git',['show',proof.sourceHead+':.github/workflows/ci.yml'],{encoding:'utf8'});assert.equal(qualificationJobInput(workflow),qualificationJobInput(originalWorkflow),'Original tool/qualification job input changed');
 const response=await fetcher('https://api.github.com/repos/'+binding.repository+'/actions/jobs/'+proof.jobId,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'}});assert(response.ok,'Official successful qualification metadata inaccessible');const job=await response.json();
 assert.equal(job.id,proof.jobId);assert.equal(job.run_id,proof.runId);assert([proof.sourceHead,proof.executionHead].includes(job.head_sha));assert.equal(job.name,'personal tracking / original evidence and native migration');assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=-300000&&age<=proof.maximumAgeHours*3600000,'Original qualification expired');
 for(const name of ['admit exact original local reporters without application replay','install locked native migration tools','real nonempty main upgrade and native dump restore','install frontend tools and audit locked inputs','actual frontend app types and affected source lint'])assert.equal(job.steps.find(s=>s.name===name)?.conclusion,'success','Original qualification step missing or failed: '+name);
 return {status:'ADMITTED_COMPLETE_NATIVE_FRONTEND_QUALIFICATION',runId:proof.runId,jobId:proof.jobId,sourceHead:proof.sourceHead,executionHead:proof.executionHead,reexecuted:false,base:binding.base,serverVersionTree:proof.serverVersionTree};
}
export function prepareMainSchema(temporary){
 const file=resolve(temporary,'main-schema.tar');
 execFileSync('git',['archive','--format=tar','--output',file,binding.base,'server-version/backend/prisma']);
 execFileSync('tar',['-xf',file,'-C',temporary]);
 return resolve(temporary,'server-version/backend/prisma/schema.prisma');
}
/** Synthetic old rows honor the existing LINKED_WAVES disclosure gate. */
export function nativeSurveyFixtureSql({owner,id,participant,wave,publication,attempt,final,digest}){
 return `INSERT INTO survey_projects(id,owner_user_id,title,collection_mode,status) VALUES ('${id}','${owner}','native upgrade sentinel','LINKED_WAVES','ACTIVE');
   INSERT INTO survey_publications(id,project_id,definition_digest,compiled_snapshot,consent_version,version) VALUES ('${publication}','${id}','${digest}','{"schemaVersion":1,"synthetic":true}',1,1);
   INSERT INTO survey_waves(id,project_id,publication_id,ordinal,title,status,consent_text,linkage_notice_confirmed) VALUES ('${wave}','${id}','${publication}',1,'T1','CLOSED','Synthetic isolated schema preservation fixture',true);
   INSERT INTO survey_participants(id,project_id,research_code,credential_hash) VALUES ('${participant}','${id}','R-SYNTHETIC','${digest}');
   INSERT INTO survey_wave_attempts(id,project_id,wave_id,participant_id,status,completed_at) VALUES ('${attempt}','${id}','${wave}','${participant}','COMPLETED',CURRENT_TIMESTAMP);
   INSERT INTO survey_wave_finals(id,attempt_id,project_id,wave_id,publication_id,submission_id,payload_hash,definition_digest,results_cipher,results_hash) VALUES ('${final}','${attempt}','${id}','${wave}','${publication}','${randomUUID()}','${digest}','${digest}','synthetic-opaque-old-report','${digest}');`;
}
async function nativeDatabase(){
 const service=process.env.PG_SERVICE;assert(service&&/^[a-zA-Z0-9_.-]+$/.test(service));
 const backend=resolve('server-version/backend'),temporary=mkdtempSync(resolve(tmpdir(),'personal-native-'));
 const names=['personal_tracking_upgrade_test','personal_tracking_restore_test'];
 const sql=(database,query)=>execFileSync('docker',['exec','-i',service,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','ptool','-d',database],{input:query,encoding:'utf8'}).trim();
 const database=name=>'postgresql://ptool:ptool123@127.0.0.1:5432/'+name+'?schema=public';
 const deploy=(schema,url)=>execFileSync(process.execPath,[resolve(backend,'node_modules/prisma/build/index.js'),'migrate','deploy','--schema',schema],{env:{...process.env,DATABASE_URL:url},stdio:'inherit'});
 try{
  for(const name of names)sql('postgres','CREATE DATABASE '+name+';');
  deploy(prepareMainSchema(temporary),database(names[0]));
  const owner=randomUUID(),id=randomUUID(),participant=randomUUID(),wave=randomUUID(),publication=randomUUID(),attempt=randomUUID(),final=randomUUID(),digest='a'.repeat(64);
  const {PrismaClient}=createRequire(resolve(backend,'package.json'))('@prisma/client'),db=new PrismaClient({datasources:{db:{url:database(names[0])}}}),login='native-'+owner.replaceAll('-','').slice(0,20);
  try{await db.user.create({data:{id:owner,username:login,passwordHash:'synthetic-schema-fixture-not-a-login',role:'TEACHER',accountDomain:'SURVEY'}});await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}});}finally{await db.$disconnect()}
  // Nonempty old-schema SQL fixture, not a repeated application journey or a
  // claim of a newly accepted scientific FINAL. Opaque original bytes survive.
  sql(names[0],nativeSurveyFixtureSql({owner,id,participant,wave,publication,attempt,final,digest}));
  const facts=db=>sql(db,`SELECT jsonb_build_object('publication',(SELECT to_jsonb(p) FROM survey_publications p WHERE id='${publication}'),'final',(SELECT to_jsonb(f) FROM survey_wave_finals f WHERE id='${final}'),'attempt',(SELECT to_jsonb(a) FROM survey_wave_attempts a WHERE id='${attempt}'))::text;`);
  const before=facts(names[0]);
  deploy(resolve(backend,'prisma/schema.prisma'),database(names[0]));assert.equal(facts(names[0]),before,'Old publication/FINAL/attempt changed');
  assert.equal(sql(names[0],`SELECT (longitudinal_plan IS NULL)::text FROM survey_projects WHERE id='${id}';`),'true');
  assert.equal(sql(names[0],`SELECT longitudinal_snapshots::text FROM survey_participants WHERE id='${participant}';`),'{}');
  sql(names[0],`UPDATE survey_projects SET longitudinal_plan='{"schemaVersion":1,"synthetic":true}' WHERE id='${id}';`);
  assert.throws(()=>sql(names[0],`UPDATE survey_projects SET longitudinal_plan='{}' WHERE id='${id}';`),/Published personal tracking plan is immutable/);
  assert.throws(()=>sql(names[0],`UPDATE survey_waves SET longitudinal_source_wave_id='different' WHERE id='${wave}';`),/Published personal tracking source is immutable/);
  const dump=execFileSync('docker',['exec',service,'pg_dump','-U','ptool','-Fc',names[0]],{maxBuffer:64*1024*1024});
  execFileSync('docker',['exec','-i',service,'pg_restore','-U','ptool','--no-owner','--no-privileges','-d',names[1]],{input:dump});
  assert.equal(facts(names[1]),before,'Native restored facts changed');
  const schema=db=>execFileSync('docker',['exec',service,'pg_dump','-U','ptool','--schema-only','--table=public.survey_projects','--table=public.survey_waves','--table=public.survey_participants','--no-owner','--no-privileges',db],{encoding:'utf8',maxBuffer:64*1024*1024}).split('\n').filter(line=>!/^\\(?:un)?restrict /.test(line)&&!/^-- Dumped (?:from|by)/.test(line)).join('\n');
  assert.equal(schema(names[0]),schema(names[1]),'Native restored schema changed');
  assert.throws(()=>sql(names[1],`UPDATE survey_projects SET longitudinal_plan='{}' WHERE id='${id}';`),/Published personal tracking plan is immutable/);
  return {status:'PASSED',base:binding.base,postgres:sql(names[0],'SHOW server_version;'),schemaFixture:'nonempty old-schema SQL, no application replay',oldFactsSHA256:hash(before),dumpSHA256:hash(dump),dumpBytes:dump.length,restoredFactsEqual:true,restoredSchemaEqual:true,schemaScope:'changed survey_projects, survey_waves, survey_participants tables, constraints, indexes and triggers; full database native restore',immutableGuards:true,dumpPublished:false};
 }finally{rmSync(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.env.GITHUB_ACTIONS,'true','Formal qualification requires the existing Actions execution context');
 const phase=process.argv[2],plan=JSON.parse(process.env.PERSONAL_TRACKING_PLAN||'null');
 assert(plan&&plan.head===git('rev-parse','HEAD')&&!plan.draft);mkdirSync('personal-tracking-evidence',{recursive:true});
 if(phase==='admit'){const originals=admitOriginalReportsInChild();const [images,audit,qualification]=await Promise.all([plan.imageReuse?verifyOriginalImages(plan):undefined,plan.backendAuditReuse?verifyOriginalBackendAudit(plan):undefined,plan.qualificationReuse?verifyOriginalQualification(plan):undefined]);writeFileSync('personal-tracking-evidence/reused-originals.json',JSON.stringify({plan,...originals,...(images?{originalImages:images}:{}),...(audit?{originalBackendAudit:audit}:{}),...(qualification?{originalQualification:qualification}:{})},null,2)+'\n');}
 else if(phase==='native')writeFileSync('personal-tracking-evidence/native-upgrade-restore.json',JSON.stringify({plan,...await nativeDatabase()},null,2)+'\n');
 else throw Error('Unknown qualification phase');
}
