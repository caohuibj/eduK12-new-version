import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.env.GITHUB_WORKSPACE;
assert(root,'Explicit checkout root required');
const binding=JSON.parse(readFileSync(resolve(root,'.github/scripts/training-workspace-integrated-bindings.json')));
const component=process.argv[2];
assert(['backend','frontend','postgres'].includes(component));
const cwd='/app',out=process.env.WORKSPACE_EVIDENCE;
assert(out);mkdirSync(out,{recursive:true});
const run=(cmd,args)=>execFileSync(cmd,args,{cwd,stdio:'inherit',env:{...process.env,NODE_ENV:'test'},timeout:600000});
let tests=binding[component+'Tests'];assert(Array.isArray(tests)&&tests.length);
assert(tests.every(p=>/^src\/[A-Za-z0-9_./-]+\.test\.tsx?$/.test(p)));
if(component==='frontend'){
 for(const[source,target]of [['server-version/cognitive-randomization-golden-v1.json','/cognitive-randomization-golden-v1.json'],['server-version/backend/src/modules/cognitive/generated/identities.json','/backend/src/modules/cognitive/generated/identities.json']]){
  const bytes=readFileSync(resolve(root,source));assert(bytes.equals(readFileSync(target)),source);
 }
 run('npx',['tsc','-p','tsconfig.app.json','--noEmit']);
 const files=Object.keys(binding.source).filter(p=>p.startsWith('server-version/frontend/src/')&&/\.tsx?$/.test(p)).map(p=>p.slice('server-version/frontend/'.length));
 assert(files.length);run('npx',['eslint',...files]);
}
if(component==='postgres'){
 const url=new URL(process.env.DATABASE_URL);assert.equal(url.href,new URL(process.env.RELEASE_INTEGRATION_DATABASE_URL).href);
 assert(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname==='/ptool');assert(Number(url.searchParams.get('connection_limit')||10)>=4);
 assert.equal(process.env.CHECKIN_SCHEDULE_DB_TEST,'1');assert.equal(process.env.WORKSPACE_LIBRARY_INTEGRATION,'1');
}
const report=resolve(out,component+'-tests.json');
run('npx',['vitest','run',...tests,'--maxWorkers=1','--reporter=default','--reporter=json','--outputFile='+report]);
const result=JSON.parse(readFileSync(report));
assert(result.success&&result.numFailedTests===0&&result.numPassedTests>0);
for(const file of tests){
 const suites=result.testResults.filter(s=>s.name===resolve(cwd,file));assert.equal(suites.length,1,file);const suite=suites[0];assert.equal(suite.status,'passed',file);assert(suite.assertionResults.length,file);
 for(const item of suite.assertionResults){
  // The existing optional live background tick is not a concurrency qualification.
  if(component==='postgres'&&file.endsWith('checkinSchedule.postgres.integration.test.ts')&&item.title==='live API scheduler publishes a due disposable fixture without a browser remaining open')assert.equal(item.status,'pending');
  else assert.equal(item.status,'passed',item.fullName);
 }
}
writeFileSync(resolve(out,'checks.json'),JSON.stringify({status:'PASS',component,sourceCommit:process.env.GITHUB_SHA,ciRunId:process.env.GITHUB_RUN_ID,suites:tests,passed:result.numPassedTests,filteredOptionalLiveTick:component==='postgres',reportSHA256:createHash('sha256').update(readFileSync(report)).digest('hex')}));
