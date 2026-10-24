import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {binding,surveyReviewPlan} from './survey-review-scope.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const dir='survey-review-evidence';
const receipt=(name,data)=>{mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/${name}.json`,JSON.stringify(data,null,2)+'\n');};
const child=(cmd,args,options={})=>execFileSync(cmd,args,{timeout:240000,stdio:'inherit',...options});
export function verifyLocal(read=readFileSync,object=git){
 const bytes=read('.github/evidence/survey-review/final-local.json');assert.equal(hash(bytes),binding.evidenceSHA256);
 const e=JSON.parse(bytes);assert.equal(e.kind,'reviewed-local-evidence');assert.equal(e.ciExecuted,false);assert.equal(e.originalExecutionSigned,false);
 assert.equal(e.product,binding.product);assert.equal(e.base,binding.base);
 assert.equal(object('rev-parse','HEAD:server-version/frontend'),e.frontendTree);
 const current=read(e.testFile).toString();assert.equal(current.split(e.addedCaseText).length,2);
 assert.equal(hash(current.replace(e.addedCaseText,'')),e.firstInvocationTestSHA256,'Existing test/fixture changed between local runs');
 const passed=new Set();
 for(const r of e.reports){
  assert.equal(r.observedExitCode,0);const raw=gunzipSync(Buffer.from(r.gzipBase64,'base64'),{maxOutputLength:4*1024*1024});assert.equal(hash(raw),r.sha256);
  const report=JSON.parse(raw);assert.equal(report.success,true);assert.equal(report.numFailedTests,0);assert.equal(report.numPassedTests,r.passed);
  assert.equal(report.testResults.length,1);assert(report.testResults[0].name.endsWith('/'+e.testFile));
  for(const a of report.testResults[0].assertionResults)if(a.status==='passed'){
   assert(!passed.has(a.fullName),'Repeated local assertion');passed.add(a.fullName);
  }
 }
 assert.equal(passed.size,49);assert([...passed].some(n=>n.includes('never reopens server-frozen')));
 return {kind:e.kind,ciExecuted:false,originalExecutionSigned:false,passed:passed.size,originalFailuresRetained:e.originalFailuresRetained,limits:e.limits};
}
export function verifyReport(report,files){
 assert.equal(report.success,true);assert.equal(report.numFailedTests,0);assert.equal(report.numPendingTests,0);assert.equal(report.numTodoTests,0);
 const actual=report.testResults.map(s=>s.name.split('/src/').at(-1)).sort();assert.deepEqual(actual,files.map(f=>f.slice(4)).sort());
 const cases=report.testResults.flatMap(s=>s.assertionResults);assert(cases.length>0);assert(cases.every(a=>a.status==='passed'));
 return {passed:cases.length,files:files.length};
}
export async function verifyOriginal(api=async path=>{
 const r=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/'+path,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'}});
 assert.equal(r.status,200,'Official CI metadata unavailable');return r.json();
},object=git){
 const r=binding.original;const run=await api('actions/runs/'+r.run);
 assert.equal(run.head_sha,r.source);assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');assert(run.pull_requests.some(p=>p.number===350));
 for(const [id,name,stage]of [[r.backendJob,'PR light / backend compile','build (tsc)'],[r.frontendJob,'PR light / frontend lint + typecheck','lint']]){
  const job=await api('actions/jobs/'+id);assert.equal(job.run_id,r.run);assert.equal(job.head_sha,r.source);assert.equal(job.name,name);assert.equal(job.status,'completed');
  assert.equal(job.conclusion,'failure','Retain original failure');assert(job.steps.some(s=>s.name===stage&&s.conclusion==='success'&&s.status==='completed'));
  const age=Date.now()-Date.parse(job.completed_at);assert(age>=0&&age<86400000,'Original stage expired');
 }
 const backendChanges=object('diff','--name-only',r.source,'HEAD','--','server-version/backend').split('\n').filter(Boolean);
 assert(backendChanges.every(p=>p.startsWith('server-version/backend/src/__tests__/')),'Backend compilation input changed');
 const frontendChanges=object('diff','--name-only',r.source,'HEAD','--','server-version/frontend').split('\n').filter(Boolean);
 assert.deepEqual(frontendChanges.sort(),binding.frontendLintChanged.map(p=>'server-version/frontend/'+p).sort(),'Changed lint inputs must be checked afresh');
 return {kind:'official-successful-stage-reuse',run:r.run,source:r.source,parentJobsRemainFailed:true,backendCompilationReplayed:false,unchangedFrontendLintReplayed:false,freshFrontendLint:binding.frontendLintChanged,productionArtifact:false};
}
function database(){
 assert.equal(process.env.CI,'true');const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55432');assert.equal(u.pathname,'/survey_review_ci');return u;
}
const sql=(url,q)=>execFileSync('psql',['--dbname',url,'-X','-At','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8',timeout:30000}).trim();
function projection(url){return sql(url,`SELECT jsonb_build_object('users',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM users t WHERE id='survey-upgrade-owner'),'projects',(SELECT jsonb_agg(to_jsonb(t)-'participant_identity_mode'-'participant_code_label'-'participant_code_instructions' ORDER BY id) FROM survey_projects t WHERE id='survey-upgrade-project'),'participants',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM survey_participants t WHERE id='survey-upgrade-person'))`)}
function upgrade(){
 const u=database(),url=u.toString(),temp=mkdtempSync(join(tmpdir(),'survey-main-upgrade-'));
 try{
  execFileSync('tar',['-x','-C',temp],{input:execFileSync('git',['archive',binding.base,'server-version/backend/prisma'],{maxBuffer:32*1024*1024})});
  child(process.execPath,['server-version/backend/node_modules/prisma/build/index.js','migrate','deploy','--schema',join(temp,'server-version/backend/prisma/schema.prisma')]);
  sql(url,`INSERT INTO users(id,username,password_hash,role,account_domain,updated_at) VALUES ('survey-upgrade-owner','survey_upgrade_owner','!unusable','STUDENT','SURVEY',now());
   INSERT INTO survey_accounts(user_id,login_name,normalized_login) VALUES ('survey-upgrade-owner','survey_upgrade_owner','survey_upgrade_owner');
   INSERT INTO survey_projects(id,owner_user_id,title,collection_mode) VALUES ('survey-upgrade-project','survey-upgrade-owner','Synthetic existing linked study','LINKED_WAVES');
   INSERT INTO survey_participants(id,project_id,research_code,credential_hash) VALUES ('survey-upgrade-person','survey-upgrade-project','R-SYNTHETIC123','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');`);
  const before=projection(url);
  child(process.execPath,['server-version/backend/node_modules/prisma/build/index.js','migrate','deploy','--schema','server-version/backend/prisma/schema.prisma']);
  assert.deepEqual(JSON.parse(projection(url)),JSON.parse(before),'Upgrade changed existing participant/project');
  assert.equal(sql(url,`SELECT participant_identity_mode FROM survey_projects WHERE id='survey-upgrade-project'`),'PERSONAL_LINK');
  assert.equal(sql(url,`SELECT count(*) FROM _prisma_migrations WHERE migration_name IN ('20261024020000_survey_memorable_participation','20261024023000_survey_self_assigned_code','20261024024500_survey_code_registry_guard') AND finished_at IS NOT NULL`),'3');
  receipt('upgrade',{passed:true,baseline:binding.base,existingIdentityAndProjectPreserved:true,oldLinkModeDefaultPreserved:true,newMigrations:3,isolatedSyntheticOnly:true});
 }finally{rmSync(temp,{recursive:true,force:true})}
}
function restore(){
 const u=database(),url=u.toString(),container=process.env.CI_POSTGRES_CONTAINER;assert.match(container||'',/^[a-f0-9]{64}$/);
 const tables=['survey_participant_codes','survey_participants','survey_wave_attempts','survey_wave_finals'];
 const snapshot=db=>Object.fromEntries(tables.map(t=>[t,sql(db,`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM ${t} t`)]));
 const before=snapshot(url);assert(JSON.parse(before.survey_wave_finals).length>=4,'Real two-wave FINAL fixtures required before restore');
 const dump=execFileSync('docker',['exec',container,'pg_dump','-U','postgres','-Fc','-d','survey_review_ci'],{maxBuffer:64*1024*1024,timeout:30000});
 sql(url,'CREATE DATABASE survey_review_restore_ci');
 execFileSync('docker',['exec','-i',container,'pg_restore','-U','postgres','--exit-on-error','--no-owner','-d','survey_review_restore_ci'],{input:dump,timeout:30000});
 u.pathname='/survey_review_restore_ci';assert.deepEqual(snapshot(u.toString()),before,'Restore changed identity/final linkage or hashes');
 assert.equal(projection(u.toString()),projection(url));
 receipt('restore',{passed:true,isolatedSyntheticOnly:true,dumpSHA256:hash(dump),allParticipantRegistryAttemptAndFinalRowsIdentical:true,finals:JSON.parse(before.survey_wave_finals).length});
}
async function main(){
 assert.equal(process.version,'v24.21.0');const action=process.argv[2];
 const {changedEntries}=await import('./content-scope.mjs');const head=git('rev-parse','HEAD');assert.deepEqual(surveyReviewPlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));
 if(action==='admission'){receipt('local-final',verifyLocal());receipt('official-stages',await verifyOriginal());}
 else if(action==='frontend'||action==='backend'){
  const files=binding.checks[action+'TestFiles'];mkdirSync(dir,{recursive:true});const target=resolve(dir,action+'-tests.json');
  child(process.execPath,['node_modules/vitest/vitest.mjs','run',...files,'--maxWorkers=2','--reporter=json','--outputFile='+target],{cwd:'server-version/'+action});
  receipt(action+'-assertions',verifyReport(JSON.parse(readFileSync(target)),files));
 }else if(action==='upgrade')upgrade();else if(action==='restore')restore();else throw Error('Unknown Survey review action');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e);process.exitCode=1});
