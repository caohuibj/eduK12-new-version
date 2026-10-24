import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {binding,trainingTeacherPlan} from './training-teacher-scope.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const output='training-teacher-evidence';
export function receipt(name,data){mkdirSync(output,{recursive:true});writeFileSync(`${output}/${name}.json`,JSON.stringify(data,null,2)+'\n')}
export function admitLocal(read=readFileSync,object=git){
 const raw=read('.github/evidence/training-teacher/reviewed-local.json');assert.equal(hash(raw),binding.evidenceSHA256);const e=JSON.parse(raw);
 assert.equal(e.kind,'reviewed-local-evidence');assert.equal(e.ciExecuted,false);assert.equal(e.originalExecutionSigned,false);assert.equal(e.product,binding.product);
 const reports={};for(const[name,r]of Object.entries(e.reports)){const b=gunzipSync(Buffer.from(r.gzipBase64,'base64'),{maxOutputLength:8*1024*1024});assert.equal(b.length,r.bytes);assert.equal(hash(b),r.sha256);reports[name]=b.toString()}
 const r=JSON.parse(reports.management);assert.equal(r.success,true);assert.equal(r.numPassedTests,26);assert.equal(r.numFailedTests,0);assert.equal(r.numPendingTests,0);assert(r.testResults.every(s=>s.status==='passed'&&s.assertionResults.every(a=>a.status==='passed')));
 assert.match(reports.codeFrontend,/Tests\s+5 passed \(5\)/);assert.match(reports.managementPostgres,/Tests\s+1 passed \(1\)/);
 assert.equal(e.toolCompletions.reduce((n,r)=>{assert.equal(r.exitCode,0);assert.equal(typeof r.session,'number');return n+r.passed},0)+32,e.caseCount);
 for(const r of Object.values(e.typeCompletions))assert.equal(r.exitCode,0);assert.equal(e.lintCompletion.exitCode,0);
 for(const[file,blob]of Object.entries(e.inputBindings))assert.equal(object('rev-parse','HEAD:'+file),blob,'Reviewed input changed: '+file);
 return {kind:e.kind,acceptedCases:e.caseCount,ciExecuted:false,originalExecutionSigned:false,review:e.review,retainedFailures:e.failuresRetained,source:binding.product};
}
function child(cmd,args,options={}){return execFileSync(cmd,args,{timeout:240000,stdio:'inherit',...options})}
function database(){assert.equal(process.env.CI,'true','Isolated Actions-only validation');const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55432');assert.equal(u.pathname,'/qualification_training_teacher_ci');u.search='';return u}
function sql(url,q){return execFileSync('psql',['--dbname',url,'-X','-At','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}).trim()}
async function main(){
 const action=process.argv[2];assert.equal(process.version,'v24.21.0');
 if(action==='fetch'){child('git',['fetch','--no-tags','--depth=1','origin',binding.base,binding.product,process.env.CI_SOURCE_HEAD]);return}
 const {changedEntries}=await import('./content-scope.mjs');const head=git('rev-parse','HEAD');assert.deepEqual(trainingTeacherPlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));
 if(action==='admission'){receipt('reviewed-local',admitLocal());return}
 if(action!=='migration')throw Error('Unknown qualification action');
 const u=database(),url=u.toString(),temp=mkdtempSync(join(tmpdir(),'trainer-base-'));
 try {
  const tar=execFileSync('git',['archive',binding.base,'server-version/backend/prisma'],{maxBuffer:32*1024*1024});execFileSync('tar',['-x','-C',temp],{input:tar});
  child(process.execPath,['server-version/backend/node_modules/prisma/build/index.js','migrate','deploy','--schema',join(temp,'server-version/backend/prisma/schema.prisma')]);
  sql(url,`INSERT INTO users (id,username,password_hash,role,updated_at) VALUES ('ci_legacy_teacher','ci_legacy_teacher','synthetic-unusable','TEACHER',NOW()); INSERT INTO teacher_codes(id,code,created_by) VALUES('ci_legacy_code','ABC23456','ci_legacy_teacher');`);
  const before=sql(url,`SELECT jsonb_build_object('users',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM users u),'codes',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM teacher_codes c))`);
  child(process.execPath,['server-version/backend/node_modules/prisma/build/index.js','migrate','deploy','--schema','server-version/backend/prisma/schema.prisma'],{cwd:resolve('.')});
  const after=sql(url,`SELECT jsonb_build_object('users',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM users u),'codes',(SELECT jsonb_agg(to_jsonb(c)-'account_validity_days' ORDER BY id) FROM teacher_codes c))`);assert.deepEqual(JSON.parse(after),JSON.parse(before));
  assert.equal(sql(url,`SELECT account_validity_days IS NULL FROM teacher_codes WHERE id='ci_legacy_code'`),'t');
  sql(url,`DO $$ BEGIN BEGIN UPDATE teacher_codes SET account_validity_days=0 WHERE id='ci_legacy_code'; RAISE EXCEPTION 'invalid duration admitted'; EXCEPTION WHEN check_violation THEN NULL; END; END $$`);
  mkdirSync(output,{recursive:true});const dump=resolve(output,'isolated-upgrade.dump');child('pg_dump',['--dbname',url,'--format=custom','--file',dump]);
  sql(url,'CREATE DATABASE qualification_restore_training_teacher_ci');u.pathname='/qualification_restore_training_teacher_ci';child('pg_restore',['--dbname',u.toString(),'--exit-on-error',dump]);
  assert.equal(sql(u.toString(),`SELECT account_validity_days IS NULL FROM teacher_codes WHERE id='ci_legacy_code'`),'t');assert.equal(sql(u.toString(),`SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name='20261024021000_teacher_code_account_validity' AND finished_at IS NOT NULL`),'1');
  receipt('migration',{oldToNewUpgrade:true,legacyAccountAndCodeUnchanged:true,nullKeepsCalendarYearDefault:true,invalidTermRejected:true,sameSchemaDumpRestore:true,dumpSHA256:hash(readFileSync(dump)),database:'synthetic-isolated'});
 }finally{rmSync(temp,{recursive:true,force:true})}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1});
