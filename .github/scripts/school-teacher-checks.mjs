import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,realpathSync,rmSync,mkdtempSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {binding,actualPlan,requireSuccess,sha256,git} from './school-teacher-scope.mjs';
const out=resolve('school-teacher-evidence');
function receipt(name,value){mkdirSync(out,{recursive:true});writeFileSync(join(out,name+'.json'),JSON.stringify(value,null,2)+'\n')}
function privateRoot(){assert(process.env.RUNNER_TEMP);const root=realpathSync(process.env.RUNNER_TEMP),p=join(root,'school-teacher-checks-private');if(!existsSync(p))mkdirSync(p,{mode:0o700});assert.equal(realpathSync(p),p);return p}
export function safeDiagnostic(raw){const text=String(raw),locations=[...text.matchAll(/(?:server-version\/)?(?:src|scripts|prisma)\/[A-Za-z0-9_./-]+\.(?:[cm]?[jt]sx?|prisma)(?::\d+(?::\d+)?|\(\d+,\d+\))/g)].map(m=>m[0]),codes=[...text.matchAll(/\berror TS\d{4,5}\b/g)].map(m=>m[0]);return {rawSha256:sha256(text),codeLocations:[...new Set(locations)].slice(0,100),compilerCodes:[...new Set(codes)],rawRetainedAfterRunnerDestruction:false};}
function command(stage,exe,args,cwd=process.cwd(),env=process.env){
 const result=spawnSync(exe,args,{cwd,env,encoding:'utf8',maxBuffer:32*1024*1024,timeout:12*60*1000});
 writeFileSync(join(privateRoot(),stage+'.log'),(result.stdout||'')+(result.stderr||''),{mode:0o600});
 receipt('command-'+stage,{stage,exitCode:result.status,signal:result.signal||null,status:result.status===0?'COMMAND_SUCCEEDED':'COMMAND_FAILED',...safeDiagnostic((result.stdout||'')+(result.stderr||''))});
 assert.equal(result.status,0,stage+' failed; private diagnostic SHA256 '+sha256((result.stdout||'')+(result.stderr||'')));
 return result.stdout;
}
export function inspectHistoricalCase(group,report,index,bytes){assert.equal(group.originalExecutionSigned,false);assert.equal(group.ciExecuted,false);assert.equal(sha256(bytes),report.sha256);
 const parsed=JSON.parse(bytes),actual=parsed.testResults.flatMap(s=>s.assertionResults||[])[index],saved=report.cases[index];assert(actual&&saved);
 assert.deepEqual({name:actual.fullName,status:actual.status},saved);return {caseName:saved.name,status:saved.status,invocationSuccess:parsed.success===true,originalExecutionSigned:false,ciExecuted:false,admitted:false};}
const auditSeverities=['info','low','moderate','high','critical'];
const npmErrorCodes=new Set(['ENOLOCK','EAUDITNOLOCK','ENOAUDIT','EUSAGE','EJSONPARSE','ENOTFOUND','ECONNRESET','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN','EINTEGRITY','E400','E401','E402','E403','E404','E405','E408','E409','E413','E429','E500','E502','E503','E504']);
function safeAuditRange(value){
 if(typeof value!=='string'||value.length>200)return null;
 const token=/^(?:[<>=~^]{1,2})?(?:v?\d+|[xX*])(?:\.(?:\d+|[xX*])){0,2}(?:-[0-9A-Za-z.-]{1,40})?(?:\+[0-9A-Za-z.-]{1,40})?$/;
 return value.replace(/([<>=~^]+)\s+/g,'$1').trim().split(/\s+/).every(s=>s==='||'||s==='-'||token.test(s))?value:null;
}
export function safeNpmAudit(raw,allowedPackages){
 let parsed;try{parsed=JSON.parse(raw)}catch{return {format:'OUTPUT_UNPARSEABLE',errorCode:'OUTPUT_UNPARSEABLE',counts:null,vulnerabilities:[]}};
 if(!parsed||typeof parsed!=='object')return {format:'OUTPUT_UNPARSEABLE',errorCode:'OUTPUT_UNPARSEABLE',counts:null,vulnerabilities:[]};
 const c=parsed.metadata?.vulnerabilities,counts=c&&[...auditSeverities,'total'].every(k=>Number.isSafeInteger(c[k])&&c[k]>=0)?Object.fromEntries([...auditSeverities,'total'].map(k=>[k,c[k]])):null;
 const errorCode=parsed.error?(npmErrorCodes.has(parsed.error.code)?parsed.error.code:'UNRECOGNIZED_ERROR'):null;
 const vulnerabilities=[];
 for(const [name,v] of Object.entries(parsed.vulnerabilities||{})){
  if(!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name)||!allowedPackages.has(name)||!v||typeof v!=='object'||!auditSeverities.includes(v.severity))continue;
  const advisories=[];
  for(const a of Array.isArray(v.via)?v.via:[]){
   if(!a||typeof a!=='object')continue;
   const entry={};if(Number.isSafeInteger(a.source)&&a.source>0)entry.source=a.source;
   const ghsa=typeof a.url==='string'&&a.url.match(/^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})$/i);if(ghsa)entry.advisoryId=ghsa[1];
   if(auditSeverities.includes(a.severity))entry.severity=a.severity;
   const range=safeAuditRange(a.range);if(range!==null)entry.range=range;
   if(entry.source||entry.advisoryId)advisories.push(entry);
  }
  vulnerabilities.push({name,severity:v.severity,range:safeAuditRange(v.range),advisories});
 }
 return {format:parsed.auditReportVersion===2?'NPM_AUDIT_V2':'UNRECOGNIZED_FORMAT',errorCode,counts,vulnerabilities};
}
export function requireNpmAuditSuccess(exitCode,report){
 assert.equal(exitCode,0,'npm audit returned a nonzero result');assert.equal(report.format,'NPM_AUDIT_V2');assert.equal(report.errorCode,null);assert(report.counts);
 assert.equal(report.counts.total,auditSeverities.reduce((sum,k)=>sum+report.counts[k],0));assert.equal(report.counts.high,0);assert.equal(report.counts.critical,0);
}
function auditComponent(component){
 const cwd=resolve('server-version',component),stage=component+'-audit';
 const result=spawnSync('npm',['audit','--package-lock-only','--omit=dev','--audit-level=high','--json'],{cwd,env:process.env,encoding:'utf8',maxBuffer:32*1024*1024,timeout:12*60*1000});
 const raw=(result.stdout||'')+(result.stderr||'');writeFileSync(join(privateRoot(),stage+'.log'),raw,{mode:0o600});
 receipt('command-'+stage,{stage,exitCode:result.status,signal:result.signal||null,status:result.status===0?'COMMAND_SUCCEEDED':'COMMAND_FAILED',...safeDiagnostic(raw)});
 const lock=JSON.parse(readFileSync(join(cwd,'package-lock.json'),'utf8')),names=new Set(Object.keys(lock.packages||{}).filter(p=>p.includes('node_modules/')).map(p=>p.split('node_modules/').at(-1)));
 const diagnostic=safeNpmAudit(result.stdout||'',names);receipt(stage+'-summary',{stage,exitCode:result.status,threshold:'HIGH/CRITICAL',...diagnostic,rawSha256:sha256(raw),rawRetainedAfterRunnerDestruction:false});
 requireNpmAuditSuccess(result.status,diagnostic);
}

export function requireReviewedCase(group,report,index,r){assert.equal(group.reviewStatus,'INDEPENDENTLY_REVIEWED');assert.match(group.reviewSha256||'',/^[a-f0-9]{64}$/);assert(group.inputClosure&&/^[a-f0-9]{64}$/.test(group.inputClosure.sha256||''));assert.equal(r.status,'passed');assert(group.admittedCaseKeys.includes(report.sha256+':'+index));return {...r,admitted:true,historicalKind:'reviewed-historical-local'};}
export function verifyTestReport(report,batch){
 assert.equal(report.success,true);assert.equal(report.numFailedTests,0);const cases=report.testResults.flatMap(s=>s.assertionResults||[]);
 const passed=cases.filter(c=>c.status==='passed').map(c=>c.fullName),filtered=cases.filter(c=>['pending','skipped'].includes(c.status)).map(c=>c.fullName);
 assert(passed.length>0,'Zero matched cases');assert.equal(new Set(passed).size,passed.length,'Ambiguous duplicate case name');
 assert.deepEqual(passed.sort(),[...batch.expectedPassed].sort(),'Actual selected assertion set drift');
 assert.deepEqual(filtered.sort(),[...batch.expectedFiltered].sort(),'Unexpected filtering');assert.equal(cases.length,passed.length+filtered.length);
 return {passed:passed.length,filtered:filtered.length,caseNames:passed,wholeInvocationSucceeded:true};
}
function verifyClosure(closure){assert(closure&&Array.isArray(closure.files)&&closure.files.length>0);assert.equal(sha256(JSON.stringify(closure.files)),closure.sha256);for(const f of closure.files){assert.match(f.path,/^(server-version\/|\.github\/)/);assert(!f.path.split('/').includes('..'));assert.equal(git('rev-parse','HEAD:'+f.path),f.blob)}}
export function reviewedCases(group){
 assert.equal(group.originalExecutionSigned,false);assert.equal(group.ciExecuted,false);
 assert(Array.isArray(group.admittedCaseKeys)&&group.admittedCaseKeys.length>0);assert.equal(new Set(group.admittedCaseKeys).size,group.admittedCaseKeys.length);
 const consumed=[],accepted=[];
 for(const r of group.reports){assert.deepEqual(Object.keys(r).sort(),['cases','invocationSuccess','sha256']);assert.match(r.sha256,/^[a-f0-9]{64}$/);assert.equal(typeof r.invocationSuccess,'boolean');
  for(const [i,c]of r.cases.entries()){assert.deepEqual(Object.keys(c).sort(),['name','status']);assert.equal(typeof c.name,'string');assert(['passed','failed','pending','skipped','todo'].includes(c.status));
   const key=r.sha256+':'+i;if(group.admittedCaseKeys.includes(key)){assert(!consumed.includes(key));consumed.push(key);accepted.push({...requireReviewedCase(group,r,i,{caseName:c.name,status:c.status,invocationSuccess:r.invocationSuccess,originalExecutionSigned:false,ciExecuted:false,admitted:false}),originalRawSha256:r.sha256,originalCaseIndex:i,originalRawVerifiedByCI:false});}
  }
 }assert.deepEqual(consumed.sort(),[...group.admittedCaseKeys].sort(),'Missing reviewed case record');return accepted;
}
function admission(b,plan){
 const evidence=JSON.parse(readFileSync('.github/scripts/school-teacher-evidence.json','utf8'));const accepted=[];
 assert(Array.isArray(evidence.acceptedGroups)&&evidence.acceptedGroups.length>0,'No reviewed historical selection');
 for(const group of evidence.acceptedGroups){verifyClosure(group.inputClosure);accepted.push(...reviewedCases(group));}
 assert(accepted.length>0);receipt('admission',{status:'PASSED',plan,ciExecuted:false,originalExecutionSigned:false,originalRawVerifiedByCI:false,countsAreNotAdditive:true,acceptedCases:accepted});
}
function batches(component,selected){const cwd=resolve('server-version',component);assert(Array.isArray(selected));for(const [i,b] of selected.entries()){
 assert(Array.isArray(b.files)&&b.files.length);for(const f of b.files)assert(/^src\/.+\.test\.tsx?$/.test(f)&&!f.split('/').includes('..'));
 assert(b.expectedPassed?.length>0&&Array.isArray(b.expectedFiltered));verifyClosure(b.inputClosure);
 const file=join(privateRoot(),component+'-'+i+'.json'),args=['node_modules/vitest/vitest.mjs','run',...b.files,'--maxWorkers=1','--no-file-parallelism','--reporter=json','--outputFile='+file];
 if(b.namePattern){assert.equal(typeof b.namePattern,'string');args.push('-t',b.namePattern)}
 try{command(component+'-tests-'+i,process.execPath,args,cwd)}finally{if(existsSync(file)){const raw=readFileSync(file),report=JSON.parse(raw),known=new Set([...b.expectedPassed,...b.expectedFiltered]);receipt(component+'-tests-'+i+'-actual',{rawSha256:sha256(raw),invocationSuccess:report.success===true,cases:report.testResults.flatMap(s=>s.assertionResults||[]).map(c=>({...known.has(c.fullName)?{name:c.fullName}:{unreviewedNameSha256:sha256(String(c.fullName))},status:['passed','failed','pending','skipped','todo'].includes(c.status)?c.status:'UNKNOWN'})),rawRetainedAfterRunnerDestruction:false})}}
 const raw=readFileSync(file);receipt(component+'-tests-'+i,{...verifyTestReport(JSON.parse(raw),b),reportSha256:sha256(raw),sourceHead:git('rev-parse','HEAD')});
 }}
function frontend(b){const cwd=resolve('server-version/frontend'),p=b.execution.frontend;assert(typeof p.types==='boolean');if(p.types)command('frontend-types',process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.app.json','--noEmit'],cwd);
 for(const f of p.lintFiles)assert(/^src\/.+\.(tsx?|jsx?)$/.test(f)&&!f.split('/').includes('..'));
 if(p.lintFiles.length)command('frontend-lint',process.execPath,['node_modules/eslint/bin/eslint.js',...p.lintFiles],cwd);
 batches('frontend',p.batches);command('frontend-build','npm',['run','build'],cwd);command('frontend-manifest',process.execPath,['.github/scripts/ci-artifact.mjs','write','frontend']);receipt('frontend',{status:'PASSED',freshBuild:true,typesExecuted:p.types});
}
function databaseGuard(){
 assert.equal(process.env.CI,'true');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.NODE_ENV,'test');
 assert.equal(existsSync(resolve('server-version/backend/.env')),false,'No developer env allowed');const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.pathname,'/school_teacher_browser_ci_test');assert.equal(u.username,'ptool');assert(process.env.DATABASE_URL===process.env.RELEASE_INTEGRATION_DATABASE_URL,'Release test endpoint mismatch');assert(process.env.DATABASE_URL===process.env.SCHOOL_TEACHER_TEST_DATABASE_URL,'School test endpoint mismatch');assert.match(process.env.CI_POSTGRES_SERVICE_ID||'',/^[a-f0-9]{64}$/);
 const d=JSON.parse(command('verify-postgres-service','docker',['inspect',process.env.CI_POSTGRES_SERVICE_ID]))[0];assert.equal(d.Config.Image,'postgres:16.15-bookworm');assert.equal(d.State.Running,true);assert(d.Config.Env.includes('POSTGRES_DB=school_teacher_browser_ci_test'));assert(d.Mounts.every(m=>m.Type==='volume'&&/^[a-f0-9]{64}$/.test(m.Name)));assert(d.NetworkSettings.Ports['5432/tcp'].some(p=>p.HostPort===u.port));return u;
}
const identifier=x=>{assert(/^[A-Za-z][A-Za-z0-9_]*$/.test(x));return '"'+x+'"'};
async function snapshots(client,tables){assert(tables.length>0);const rows=[];for(const entry of tables){const table=typeof entry==='string'?entry:entry.table;identifier(table);const columns=typeof entry==='string'?(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[table])).rows.map(r=>r.column_name):entry.columns;assert(columns.length>0);const projection=columns.map(identifier).join(',');const q=await client.query('SELECT to_jsonb(t)::text AS row FROM (SELECT '+projection+' FROM '+identifier(table)+') t ORDER BY to_jsonb(t)::text');assert(q.rows.length>0,'Nonempty preservation table required: '+table);rows.push({table,columns,count:q.rows.length,sha256:sha256(JSON.stringify(q.rows))})}return rows}

async function migrate(b){databaseGuard();const {Client}=createRequire(resolve('server-version/backend/package.json'))('pg');const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try{const m=b.execution.migration;assert(m.baselineFixtureSql&&m.preserveTables.length);assert.equal(sha256(m.baselineFixtureSql),m.baselineFixtureSha256);
  const dir=mkdtempSync(join(privateRoot(),'baseline-'));const archive=join(privateRoot(),'baseline.tar');
  // Binary git archive uses a direct binary spawn rather than the text diagnostic helper.
  const tar=spawnSync('git',['archive','--format=tar',b.base,'server-version/backend/prisma'],{maxBuffer:32*1024*1024});assert.equal(tar.status,0);writeFileSync(archive,tar.stdout,{mode:0o600});command('extract-baseline','tar',['-xf',archive,'-C',dir]);
  command('migrate-old',process.execPath,[resolve('server-version/backend/node_modules/prisma/build/index.js'),'migrate','deploy','--schema',join(dir,'server-version/backend/prisma/schema.prisma')]);
  await client.query(m.baselineFixtureSql);const before=await snapshots(client,m.preserveTables);
  command('migrate-current',process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],resolve('server-version/backend'));const after=await snapshots(client,before);assert.deepEqual(after,before);receipt('migration',{status:'PASSED',base:b.base,sourceHead:git('rev-parse','HEAD'),preserved:after});
 }finally{await client.end()}}
async function restore(b){databaseGuard();const {Client}=createRequire(resolve('server-version/backend/package.json'))('pg'),u=new URL(process.env.DATABASE_URL),owner=new Client({connectionString:u.href});await owner.connect();const db='school_teacher_restore_ci_test',svc=process.env.CI_POSTGRES_SERVICE_ID;
 try{const before=await snapshots(owner,b.execution.migration.restoreTables);await owner.query('CREATE DATABASE '+identifier(db));
  command('dump-current','docker',['exec',svc,'pg_dump','-U','ptool','-d','school_teacher_browser_ci_test','--format=custom','--file=/tmp/school-teacher.dump']);
  command('restore-current','docker',['exec',svc,'pg_restore','-U','ptool','-d',db,'--exit-on-error','/tmp/school-teacher.dump']);u.pathname='/'+db;const restored=new Client({connectionString:u.href});await restored.connect();try{assert.deepEqual(await snapshots(restored,before),before)}finally{await restored.end()}
  const fixtureModule=await import(pathToFileURL(resolve('server-version/e2e/school-teacher-fixture.cjs'))),fixture=(fixtureModule.default||fixtureModule).readFixture().value;const runtimeUrl=new URL(fixture.runtimeUrl);assert.equal(runtimeUrl.hostname,u.hostname);runtimeUrl.pathname='/'+db;const {PrismaClient}=createRequire(resolve('server-version/backend/package.json'))('@prisma/client');const runtime=new PrismaClient({datasources:{db:{url:runtimeUrl.href}}});try{const {verifyRuntimePrivileges}=await import(pathToFileURL(resolve('server-version/backend/scripts/runtime-role-contract.mjs'))),{verifyReleaseSchema}=await import(pathToFileURL(resolve('server-version/backend/scripts/release-schema-contract.mjs')));assert.equal((await verifyRuntimePrivileges(runtime)).restrictedRuntimeRole,true);await verifyReleaseSchema(runtime);}finally{await runtime.$disconnect()}
  receipt('restore',{status:'PASSED',preserved:before,restrictedRuntimeRole:true,releaseSchemaVerified:true});
 }finally{await owner.query('DROP DATABASE IF EXISTS '+identifier(db)+' WITH (FORCE)');await owner.end();command('remove-private-dump','docker',['exec',svc,'rm','-f','/tmp/school-teacher.dump'])}}
function cleanup(){const root=realpathSync(process.env.RUNNER_TEMP);for(const name of ['school-teacher-private','school-teacher-checks-private','school-teacher-seed.log']){const p=join(root,name);if(existsSync(p)){assert.equal(realpathSync(p),p);rmSync(p,{recursive:true})}}receipt('cleanup',{privateMaterialRemoved:true})}
async function main(){const phase=process.argv[2];if(phase==='cleanup'){cleanup();return}assert.equal(process.version,'v24.21.0');const b=binding(),plan=actualPlan();assert.deepEqual(plan,JSON.parse(process.env.PLAN));
 if(phase==='admission')admission(b,plan);
 else if(phase==='frontend')frontend(b);
 else if(phase==='backend'){assert.equal(b.backendBuildDecision,'fresh-once');command('backend-compile',process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.json'],resolve('server-version/backend'));command('backend-manifest',process.execPath,['.github/scripts/ci-artifact.mjs','write','backend']);}
 else if(phase==='migrate')await migrate(b);
 else if(phase==='postgres'){databaseGuard();assert(b.execution.backend.batches.length>0);batches('backend',b.execution.backend.batches)}
 else if(phase==='seed'){databaseGuard();command('browser-fixture',process.execPath,['server-version/e2e/school-teacher-fixture.cjs','seed']);}
 else if(phase==='restore')await restore(b);
 else if(phase==='browser-report'){const module=await import(pathToFileURL(resolve(b.execution.browserHelper))),helper=module.default||module;assert.equal(typeof helper.verifyReport,'function');const report=JSON.parse(readFileSync(join(out,'browser.json'))),frontend=JSON.parse(readFileSync('server-version/frontend/dist/ci-build-manifest.json')),backend=JSON.parse(readFileSync('server-version/backend/dist/ci-build-manifest.json'));const result=helper.verifyReport(report,{head:plan.head,tree:plan.sourceTree,runId:process.env.GITHUB_RUN_ID,frontend,backend},file=>{assert(/^screenshots\/[a-z0-9-]+\.png$/.test(file));return readFileSync(join(out,file))});receipt('browser-acceptance',result);}
 else if(phase==='audit'){for(const component of b.execution.auditComponents){assert(['frontend','backend'].includes(component));auditComponent(component)}receipt('audit',{status:'PASSED',threshold:'HIGH/CRITICAL',components:b.execution.auditComponents})}
 else if(phase==='aggregate')requireSuccess(plan,JSON.parse(process.env.NEEDS_JSON));
 else throw Error('Unknown phase');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await main()}catch(error){const phase=process.argv[2];assert(/^[a-z-]+$/.test(phase||''));const raw=String(error?.stack||error);writeFileSync(join(privateRoot(),'phase-'+phase+'.log'),raw,{mode:0o600});receipt('phase-'+phase+'-failure',{phase,status:'FAILED',...safeDiagnostic(raw)});console.error('School Teacher phase failed: '+phase+'; see safe diagnostic SHA '+sha256(raw));process.exitCode=1;}}
