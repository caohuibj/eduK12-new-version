import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {binding,pr357Plan} from './pr357-scope.mjs';
import {changedEntries} from './content-scope.mjs';
const root=process.cwd(),out=resolve('pr357-evidence');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const digest=value=>createHash('sha256').update(value).digest('hex');
function run(exe,args,cwd=root,env=process.env){const r=spawnSync(exe,args,{cwd,env,stdio:'inherit'});assert.equal(r.status,0,exe+' '+args.join(' '));}
export function verifyReport(report,expectedFiles){
 assert.equal(report.success,true);assert.equal(report.numFailedTests,0);assert.equal(report.numPendingTests,0);assert(report.numPassedTests>0);
 assert.equal(report.testResults.length,expectedFiles.length);
 for(const path of expectedFiles){const matches=report.testResults.filter(row=>row.name.replaceAll('\\','/').endsWith('/'+path));assert.equal(matches.length,1);assert.equal(matches[0].status,'passed');assert(matches[0].assertionResults.length>0);assert(matches[0].assertionResults.every(a=>a.status==='passed'));}
 return {files:report.testResults.length,passed:report.numPassedTests,failed:0,pending:0};
}
function verify(){assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.CI,'true');assert.equal(process.version,'v24.21.0');const head=git('rev-parse','HEAD'),p=JSON.parse(process.env.PLAN);assert.equal(head,process.env.GITHUB_SHA);assert.equal(p.head,head);assert.deepEqual(pr357Plan(changedEntries(p.base,head),p.base,head),p);return p;}
function save(name,value){mkdirSync(out,{recursive:true});writeFileSync(join(out,name+'.json'),JSON.stringify({head:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,...value},null,2)+'\n');}
function frontend(){const cwd=resolve('server-version/frontend');run('npm',['run','typecheck'],cwd);
 const paths=Object.keys(binding.source).filter(p=>p.startsWith('server-version/frontend/src/')&&/\.(ts|tsx)$/.test(p)).map(p=>p.replace('server-version/frontend/',''));
 run('npx',['eslint',...paths],cwd);const file=join(out,'frontend-tests.json');run('npx',['vitest','run',...binding.tests.frontend,'--maxWorkers=2','--reporter=json','--outputFile='+file],cwd);
 save('frontend-verified',verifyReport(JSON.parse(readFileSync(file,'utf8')),binding.tests.frontend));run('npm',['run','build'],cwd);run('node',['.github/scripts/ci-artifact.mjs','write','frontend']);
}
function dockerTest(files,name,url,flags={}){const file=name+'.json',env={CI:'true',GITHUB_ACTIONS:'true',TZ:'UTC',NODE_ENV:'test',BACKGROUND_WORKERS_ENABLED:'false',DATA_ENCRYPTION_KEY:'ab'.repeat(32),DATA_PSEUDONYM_KEY:'bc'.repeat(32),JWT_SECRET:'pr357-disposable-test-only',CAMPUS_ELIGIBILITY_HMAC_KEY:'cd'.repeat(32),REDIS_URL:process.env.REDIS_URL,ROSTER_INTEGRATION_REDIS_URL:process.env.REDIS_URL,...flags,...(url?{DATABASE_URL:url,RELEASE_INTEGRATION_DATABASE_URL:url,PR26_INTEGRATION_DATABASE_URL:url,COGNITIVE_INTEGRATION_DB_URL:url,TRAINING_ARCHIVE_TEST_DATABASE_URL:url}:{})};
 run('docker',['run','--rm','--network','host',...Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]),'-v',out+':/evidence','pr357-build','npx','vitest','run',...files,'--maxWorkers=1','--reporter=json','--outputFile=/evidence/'+file]);
 save(name+'-verified',verifyReport(JSON.parse(readFileSync(join(out,file),'utf8')),files));
}
function sql(db,text){assert(/^pr357_[a-z0-9_]+_ci_test$/.test(db)||db==='postgres');return execFileSync('docker',['exec',process.env.CI_POSTGRES_SERVICE_ID,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','ptool','-d',db,'-c',text],{encoding:'utf8'}).trim();}
function database(){const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.pathname,'/pr357_upgrade_ci_test');assert.equal(u.username,'ptool');assert.match(process.env.CI_POSTGRES_SERVICE_ID,/^[a-f0-9]{64}$/);
 const service=JSON.parse(execFileSync('docker',['inspect',process.env.CI_POSTGRES_SERVICE_ID],{encoding:'utf8'}))[0];assert.equal(service.Config.Image,'postgres:16.15-bookworm');assert.equal(service.State.Running,true);assert(service.Mounts.every(m=>m.Type==='volume'&&/^[a-f0-9]{64}$/.test(m.Name)));assert(service.NetworkSettings.Ports['5432/tcp'].some(p=>p.HostPort===u.port));
 const url=db=>{const v=new URL(u);v.pathname='/'+db;return v.href;};
 const baseline=resolve(process.env.RUNNER_TEMP,'pr357-baseline');mkdirSync(baseline,{recursive:true});const archive=execFileSync('git',['archive',binding.base,'server-version/backend/prisma'],{maxBuffer:32*1024*1024});const unpack=spawnSync('tar',['-x','-C',baseline],{input:archive});assert.equal(unpack.status,0);
 const migrate=(schema,mount=[])=>run('docker',['run','--rm','--network','host','-e','DATABASE_URL='+u.href,...mount,'pr357-build','npx','prisma','migrate','deploy','--schema',schema]);
 migrate('/baseline/server-version/backend/prisma/schema.prisma',['-v',baseline+':/baseline:ro']);
 sql('pr357_upgrade_ci_test',"INSERT INTO users(id,username,password_hash,updated_at) VALUES ('pr357-upgrade-sentinel','pr357-upgrade-sentinel','synthetic-no-login',CURRENT_TIMESTAMP)");
 const before=sql('pr357_upgrade_ci_test',"SELECT row_to_json(u)::text FROM users u WHERE id='pr357-upgrade-sentinel'");migrate('prisma/schema.prisma');assert.equal(sql('pr357_upgrade_ci_test',"SELECT row_to_json(u)::text FROM users u WHERE id='pr357-upgrade-sentinel'"),before);
 assert.equal(Number(sql('pr357_upgrade_ci_test','SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')),239);save('upgrade',{status:'PASS',oldUserPreserved:true,migrations:239});
 const selected=binding.tests.backend,unit=selected.filter(p=>!p.includes('.postgres.'));if(unit.length){sql('postgres','CREATE DATABASE pr357_unit_ci_test TEMPLATE pr357_upgrade_ci_test');dockerTest(unit,'backend-unit',url('pr357_unit_ci_test'));}
 let roster;
 for(const [i,file]of selected.filter(p=>p.includes('.postgres.')).entries()){const db='pr357_case_'+i+'_ci_test';sql('postgres',`CREATE DATABASE ${db} TEMPLATE pr357_upgrade_ci_test`);const redis=new URL(process.env.REDIS_URL);redis.pathname='/'+i;assert(i<14);dockerTest([file],'postgres-'+i,url(db),{REDIS_URL:redis.href,ROSTER_INTEGRATION_REDIS_URL:redis.href});if(file.includes('educationRosterJobs.'))roster=db;}
 const compactDb='pr357_compact_report_ci_test';sql('postgres',`CREATE DATABASE ${compactDb} TEMPLATE pr357_upgrade_ci_test`);
 const compactRedis=new URL(process.env.REDIS_URL);compactRedis.pathname='/13';
 dockerTest(['src/__tests__/integration/educationPrivateScaleReport.postgres.integration.test.ts'],'compact-report',url(compactDb),{ASSESSMENT_COMPACT_FACTS_ENABLED:'true',REDIS_URL:compactRedis.href,ROSTER_INTEGRATION_REDIS_URL:compactRedis.href});
 assert(Number(sql(compactDb,"SELECT count(*) FROM assessments WHERE status='COMPLETED' AND result->>'k'='SFF1'"))>0,'Compact consumer must use real compact facts');
 assert(roster);const tables=['campus_personnel_import_batches','campus_personnel','campus_personnel_assignments','campus_personnel_credentials','education_roster_import_jobs','education_roster_import_parts'];
 const snapshot=db=>tables.map(table=>({table,count:Number(sql(db,'SELECT count(*) FROM '+table)),hash:digest(sql(db,'SELECT row_to_json(t)::text FROM '+table+' t ORDER BY row_to_json(t)::text'))}));const original=snapshot(roster);assert(original.find(x=>x.table==='education_roster_import_parts').count>0);assert(original.find(x=>x.table==='education_roster_import_jobs').count>0);
 const backup=join(process.env.RUNNER_TEMP,'pr357-roster.dump');execFileSync('docker',['exec',process.env.CI_POSTGRES_SERVICE_ID,'pg_dump','-U','ptool','-Fc','-f','/tmp/pr357-roster.dump',roster]);run('docker',['cp',process.env.CI_POSTGRES_SERVICE_ID+':/tmp/pr357-roster.dump',backup]);sql('postgres','CREATE DATABASE pr357_restore_ci_test');run('docker',['exec',process.env.CI_POSTGRES_SERVICE_ID,'pg_restore','-U','ptool','--exit-on-error','--no-owner','-d','pr357_restore_ci_test','/tmp/pr357-roster.dump']);assert.deepEqual(snapshot('pr357_restore_ci_test'),original);
 assert(Number(sql('pr357_restore_ci_test',"SELECT count(*) FROM education_roster_import_parts WHERE state='COMMITTED'"))>0);
 sql('pr357_restore_ci_test',"DO $$ BEGIN BEGIN UPDATE education_roster_import_parts SET input_digest=input_digest||'tamper' WHERE state='COMMITTED'; RAISE EXCEPTION 'Restored receipt trigger missing'; EXCEPTION WHEN SQLSTATE '23000' THEN NULL; END; END $$");
 save('restore',{status:'PASS',tables:original});
}
async function main(){verify();mkdirSync(out,{recursive:true});const phase=process.argv[2];if(phase==='source')return;if(phase==='frontend')return frontend();if(phase==='database')return database();throw Error('Unknown PR357 phase');}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
