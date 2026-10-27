import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {binding,pr357Plan} from './pr357-scope.mjs';
import {changedEntries} from './content-scope.mjs';
import {original,testContinuation,copyOriginalBackend,originalAudit,originalSast,copyDeliveredFrontend,databaseContinuation,verifyQuotaContinuation,rosterFile,quotaName} from './pr357-continuation.mjs';
const root=process.cwd(),out=resolve('pr357-evidence');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const digest=value=>createHash('sha256').update(value).digest('hex');
function run(exe,args,cwd=root,env=process.env){const {GH_TOKEN,...childEnv}=env;const r=spawnSync(exe,args,{cwd,env:childEnv,stdio:'inherit'});assert.equal(r.status,0,exe+' '+args.join(' '));}
export function verifyReport(report,expectedFiles){
 assert.equal(report.success,true);assert.equal(report.numFailedTests,0);assert.equal(report.numPendingTests,0);assert(report.numPassedTests>0);
 assert.equal(report.testResults.length,expectedFiles.length);
 for(const path of expectedFiles){const matches=report.testResults.filter(row=>row.name.replaceAll('\\','/').endsWith('/'+path));assert.equal(matches.length,1);assert.equal(matches[0].status,'passed');assert(matches[0].assertionResults.length>0);assert(matches[0].assertionResults.every(a=>a.status==='passed'));}
 return {files:report.testResults.length,passed:report.numPassedTests,failed:0,pending:0};
}
function verify(){assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.CI,'true');assert.equal(process.version,'v24.21.0');const head=git('rev-parse','HEAD'),p=JSON.parse(process.env.PLAN);assert.equal(head,process.env.GITHUB_SHA);assert.equal(p.head,head);assert.deepEqual(pr357Plan(changedEntries(p.base,head),p.base,head),p);return p;}
function save(name,value){mkdirSync(out,{recursive:true});writeFileSync(join(out,name+'.json'),JSON.stringify({...value,candidate:{head:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT}},null,2)+'\n');}
function dockerTest(files,name,url,flags={},selection=null){const file=name+'.json',env={CI:'true',GITHUB_ACTIONS:'true',TZ:'UTC',NODE_ENV:'test',BACKGROUND_WORKERS_ENABLED:'false',DATA_ENCRYPTION_KEY:'ab'.repeat(32),DATA_PSEUDONYM_KEY:'bc'.repeat(32),JWT_SECRET:'pr357-disposable-test-only-32-characters-minimum',CAMPUS_ELIGIBILITY_HMAC_KEY:'cd'.repeat(32),REDIS_URL:process.env.REDIS_URL,ROSTER_INTEGRATION_REDIS_URL:process.env.REDIS_URL,...flags,...(url?{DATABASE_URL:url,RELEASE_INTEGRATION_DATABASE_URL:url,PR26_INTEGRATION_DATABASE_URL:url,COGNITIVE_INTEGRATION_DB_URL:url,TRAINING_ARCHIVE_TEST_DATABASE_URL:url}:{})};
 run('docker',['run','--rm','--network','host',...Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]),'-v',out+':/evidence','pr357-build','npx','vitest','run',...files,...(selection?['--testNamePattern','^'+quotaName+'$']:[]),'--maxWorkers=1','--reporter=default','--reporter=json','--outputFile=/evidence/'+file]);
 const report=JSON.parse(readFileSync(join(out,file),'utf8'));save(name+'-verified',selection?verifyQuotaContinuation(report,selection):verifyReport(report,files));
}
export function postgresRedis(base,file,index){
 assert.equal(binding.tests.backend.filter(p=>p.includes('.postgres.'))[index],file);assert(index>=0&&index<13);
 const redis=new URL(base);assert(['127.0.0.1','localhost'].includes(redis.hostname));assert.equal(redis.protocol,'redis:');redis.pathname='/'+(file===rosterFile?14:index);return redis.href;
}
function sql(db,text){assert(/^pr357_[a-z0-9_]+_ci_test$/.test(db)||db==='postgres');return execFileSync('docker',['exec',process.env.CI_POSTGRES_SERVICE_ID,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','ptool','-d',db,'-c',text],{encoding:'utf8'}).trim();}
async function database(){const prior=await testContinuation('backend');const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.pathname,'/pr357_upgrade_ci_test');assert.equal(u.username,'ptool');assert.match(process.env.CI_POSTGRES_SERVICE_ID,/^[a-f0-9]{64}$/);
 const service=JSON.parse(execFileSync('docker',['inspect',process.env.CI_POSTGRES_SERVICE_ID],{encoding:'utf8'}))[0];assert.equal(service.Config.Image,'postgres:16.15-bookworm');assert.equal(service.State.Running,true);assert(service.Mounts.every(m=>m.Type==='volume'&&/^[a-f0-9]{64}$/.test(m.Name)));assert(service.NetworkSettings.Ports['5432/tcp'].some(p=>p.HostPort===u.port));
 const url=db=>{const v=new URL(u);v.pathname='/'+db;return v.href;};
 assert.equal(prior.upgrade.head,original.checkout);assert.equal(prior.upgrade.run,String(original.run));assert.equal(prior.upgrade.status,'PASS');assert.equal(prior.upgrade.oldUserPreserved,true);assert.equal(prior.upgrade.migrations,239);
 save('upgrade-reused',{status:'REUSED_EXACT_SCHEMA_UPGRADE',proof:prior.proof,originalReceipt:prior.upgrade});
 // Current deploy is only an empty fixture template for missing tests, not a
 // second before/after upgrade qualification of the already-passed input.
 run('docker',['run','--rm','--network','host','-e','DATABASE_URL='+u.href,'pr357-build','npx','prisma','migrate','deploy','--schema','prisma/schema.prisma']);
 assert.equal(Number(sql('pr357_upgrade_ci_test','SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')),239);
 const selected=binding.tests.backend,progress=await databaseContinuation(prior);
 save('database-progress-reused',{status:'REUSED_EXACT_PASSED_CASES',...progress});
 let roster;
 for(const [i,file]of selected.filter(p=>p.includes('.postgres.')).entries()){
  if(i<5)continue;
  const db='pr357_case_'+i+'_ci_test';sql('postgres',`CREATE DATABASE ${db} TEMPLATE pr357_upgrade_ci_test`);
  const redis=postgresRedis(process.env.REDIS_URL,file,i);
  dockerTest([file],'postgres-'+i,url(db),{REDIS_URL:redis,ROSTER_INTEGRATION_REDIS_URL:redis},file===rosterFile?progress.acceptedRosterNames:null);
  if(file===rosterFile)roster=db;
 }
 const compactDb='pr357_compact_report_ci_test';sql('postgres',`CREATE DATABASE ${compactDb} TEMPLATE pr357_upgrade_ci_test`);
 const compactRedis=new URL(process.env.REDIS_URL);compactRedis.pathname='/13';
 dockerTest(['src/__tests__/integration/educationPrivateScaleReport.postgres.integration.test.ts'],'compact-report',url(compactDb),{ASSESSMENT_COMPACT_FACTS_ENABLED:'true',REDIS_URL:compactRedis.href,ROSTER_INTEGRATION_REDIS_URL:compactRedis.href});
 assert(Number(sql(compactDb,"SELECT count(*) FROM assessments WHERE status='COMPLETED' AND result->>'k'='SFF1'"))>0,'Compact consumer must use real compact facts');
 assert(roster);const tables=['campus_personnel_import_batches','campus_personnel','campus_personnel_assignments','campus_personnel_credentials','education_roster_import_jobs','education_roster_import_parts'];
 const snapshot=db=>tables.map(table=>({table,count:Number(sql(db,'SELECT count(*) FROM '+table)),hash:digest(sql(db,'SELECT row_to_json(t)::text FROM '+table+' t ORDER BY row_to_json(t)::text'))}));const beforeRestore=snapshot(roster);assert(beforeRestore.find(x=>x.table==='education_roster_import_parts').count>0);assert(beforeRestore.find(x=>x.table==='education_roster_import_jobs').count>0);
 const backup=join(process.env.RUNNER_TEMP,'pr357-roster.dump');execFileSync('docker',['exec',process.env.CI_POSTGRES_SERVICE_ID,'pg_dump','-U','ptool','-Fc','-f','/tmp/pr357-roster.dump',roster]);run('docker',['cp',process.env.CI_POSTGRES_SERVICE_ID+':/tmp/pr357-roster.dump',backup]);sql('postgres','CREATE DATABASE pr357_restore_ci_test');run('docker',['exec',process.env.CI_POSTGRES_SERVICE_ID,'pg_restore','-U','ptool','--exit-on-error','--no-owner','-d','pr357_restore_ci_test','/tmp/pr357-roster.dump']);assert.deepEqual(snapshot('pr357_restore_ci_test'),beforeRestore);
 assert(Number(sql('pr357_restore_ci_test',"SELECT count(*) FROM education_roster_import_parts WHERE state='COMMITTED'"))>0);
 sql('pr357_restore_ci_test',"DO $$ BEGIN BEGIN UPDATE education_roster_import_parts SET input_digest=input_digest||'tamper' WHERE state='COMMITTED'; RAISE EXCEPTION 'Restored receipt trigger missing'; EXCEPTION WHEN SQLSTATE '23000' THEN NULL; END; END $$");
 save('restore',{status:'PASS',tables:beforeRestore});
}
async function main(){verify();mkdirSync(out,{recursive:true});const phase=process.argv[2];if(phase==='source')return;if(phase==='frontend-reuse'){save('frontend-reuse',await copyDeliveredFrontend());run('node',['.github/scripts/ci-artifact.mjs','write','frontend']);return;}if(phase==='database')return database();if(phase==='prepare-backend'){save('backend-reuse',await copyOriginalBackend());run('node',['.github/scripts/ci-artifact.mjs','write','backend']);return;}if(phase==='audit-reuse'){save('audit-reused',await originalAudit());return;}if(phase==='sast-reuse'){const proof=await originalSast();save('sast-reused',proof);assert(process.env.GITHUB_OUTPUT);appendFileSync(process.env.GITHUB_OUTPUT,'config='+proof.config+'\n');return;}throw Error('Unknown PR357 phase');}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
