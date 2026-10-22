import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {followup,trainingFollowupPlan} from './training-followup-scope.mjs';
import {changedEntries} from './content-scope.mjs';

const component=process.argv[2];
assert.ok(['frontend','backend'].includes(component));
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.deepEqual(JSON.parse(process.env.PLAN),trainingFollowupPlan(changedEntries(followup.base,head),followup.base,head));
const cwd=resolve('server-version',component),directory=resolve('training-followup-evidence');
mkdirSync(directory,{recursive:true});
const commands=[];
function run(args){
  const record={command:['npm',...args],component,head,exitCode:null};
  commands.push(record);
  try {execFileSync('npm',args,{cwd,stdio:'inherit',timeout:300000});record.exitCode=0;}
  catch(error){record.exitCode=error.status ?? 'signal';throw error;}
  finally {writeFileSync(resolve(directory,component+'-commands.json'),JSON.stringify({head,product:followup.product,componentTree:followup.components[component],node:process.version,commands},null,2));}
}
const files=followup[component+'Tests'];
assert.ok(files.length && files.every(file=>/^src\/[A-Za-z0-9_./-]+\.test\.tsx?$/.test(file)));
if(component==='frontend'){
  const changed=Object.keys(followup.source).filter(file=>file.startsWith('server-version/frontend/src/')&&/\.tsx?$/.test(file)).map(file=>file.slice('server-version/frontend/'.length));
  run(['exec','--','eslint',...changed]);
  run(['exec','--','tsc','-p','tsconfig.app.json','--noEmit']);
}else{
  assert.equal(process.env.CI,'true');
  const url=new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/training_followup_ci');
  assert.equal(process.env.RELEASE_INTEGRATION_DATABASE_URL,process.env.DATABASE_URL);
  assert.equal(process.env.FORM_TEMPLATE_INTEGRATION,'1');
  run(['exec','--','prisma','generate']);
  run(['exec','--','tsc','--noEmit']);
  // Only the disposable Actions service is migrated. No Mac or production URL.
  run(['exec','--','prisma','migrate','deploy']);
}
const report=resolve(directory,component+'-tests.json');
run(['exec','--','vitest','run',...files,'--maxWorkers=2','--reporter=default','--reporter=json','--outputFile='+report]);
const result=JSON.parse(readFileSync(report));
assert.equal(result.success,true);assert.equal(result.numFailedTests,0);assert.equal(result.numPendingTests,0);assert.ok(result.numPassedTests>0);
for(const file of files)assert.ok(result.testResults.some(test=>test.name===resolve(cwd,file)&&test.status==='passed'&&test.assertionResults.length&&test.assertionResults.every(item=>item.status==='passed')),file);
if(component==='backend'){
  assert.equal(result.numPassedTests,7);
  assert.ok(result.testResults.flatMap(test=>test.assertionResults).some(test=>test.title.includes('exact grant revocation')));
}else run(['run','build']);
