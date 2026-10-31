import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,openSync,closeSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pr364Plan} from './pr364-scope.mjs';
import {changedEntries} from './content-scope.mjs';

export const UI_CASES=[
 'bounded resource pagination continues an empty eligible source page and preserves the selected source grant',
 'bounded resource pagination appends P/R choices without clearing selections or replacing the original grant',
 'bounded resource pagination refuses a changed measurement on later pages and preserves the prior selection',
];
export const PG_CASES=['education management exact multi-grant selection with real isolated PostgreSQL paginates 51 authorized sources and 51 report versions without dropping the last item or widening authority'];
export function verifySelected(report,expected,filtered){
 assert.equal(report.success,true);assert.equal(report.numFailedTests,0);
 const cases=report.testResults.flatMap(s=>s.assertionResults);
 assert.equal(new Set(cases.map(c=>c.fullName)).size,cases.length);
 assert.deepEqual(cases.filter(c=>c.status==='passed').map(c=>c.fullName).sort(),[...expected].sort());
 assert.equal(cases.filter(c=>['pending','skipped'].includes(c.status)).length,filtered);
 assert.equal(cases.length,expected.length+filtered);
 assert.equal(report.numPassedTests,expected.length);
 return {passed:expected.length,filtered,caseNames:expected};
}
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const out=resolve('pr364-evidence');
const save=(name,value)=>{mkdirSync(out,{recursive:true});writeFileSync(resolve(out,name+'.json'),JSON.stringify(value,null,2)+'\n');};
function identity(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.CI,'true');
 const head=git('rev-parse','HEAD');assert.equal(head,process.env.GITHUB_SHA);
 const plan=JSON.parse(process.env.PLAN);assert.equal(plan.head,head);
 assert.deepEqual(pr364Plan(changedEntries(plan.base,head),plan.base,head),plan);
 assert.equal(plan.draft,false);assert.equal(plan.postMerge,false);
 assert.equal(process.version,'v24.21.0');
 return {...plan,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT};
}
function run(id,args,cwd,source){
 mkdirSync(out,{recursive:true});const logfile=resolve(out,id+'.log'),fd=openSync(logfile,'w');
 const startedAt=new Date().toISOString();let result;
 const inputs={source,node:process.version,platform:process.platform,arch:process.arch,
  environment:{NODE_ENV:process.env.NODE_ENV,TZ:process.env.TZ,BACKGROUND_WORKERS_ENABLED:process.env.BACKGROUND_WORKERS_ENABLED},
  files:Object.fromEntries(['package.json','package-lock.json','node_modules/.package-lock.json',args[0],'node_modules/.prisma/client/schema.prisma']
   .filter(path=>existsSync(resolve(cwd,path))).map(path=>[path,hash(readFileSync(resolve(cwd,path)))]))};
 save(id+'-inputs',inputs);
 const {GITHUB_TOKEN,GH_TOKEN,...env}=process.env;
 try{result=spawnSync('node',args,{cwd,env,stdio:['ignore',fd,fd]});}finally{closeSync(fd);}
 const receipt={id,source,argv:['node',...args],cwd,startedAt,completedAt:new Date().toISOString(),exitCode:result.status,signal:result.signal,inputsSHA256:hash(readFileSync(resolve(out,id+'-inputs.json'))),logSHA256:hash(readFileSync(logfile))};
 save(id,receipt);assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0,id+' failed');return receipt;
}
function execute(phase){
 const source=identity();save('source-'+phase,source);
 if(phase==='source')return;
 if(phase==='frontend'){
  const cwd=resolve('server-version/frontend');
  run('frontend-types',['node_modules/typescript/bin/tsc','-p','tsconfig.app.json','--noEmit'],cwd,source);
  run('frontend-pagination',['node_modules/vitest/vitest.mjs','run','src/components/education-tools/EducationAssessmentRegistrationPanel.test.tsx','-t','bounded resource pagination','--reporter=json','--outputFile='+resolve(out,'frontend-report.json')],cwd,source);
  save('frontend-result',{source,...verifySelected(JSON.parse(readFileSync(resolve(out,'frontend-report.json'))),UI_CASES,13)});
 }else if(phase==='backend'){
  const cwd=resolve('server-version/backend');
  run('backend-types',['node_modules/typescript/bin/tsc','--noEmit'],cwd,source);
  // Fresh isolated schema setup, not a repeat of the previous release's upgrade/restore qualification.
  run('database-setup',['node_modules/prisma/build/index.js','migrate','deploy'],cwd,source);
  run('postgres-pagination',['node_modules/vitest/vitest.mjs','run','src/__tests__/education-tools/assessment-resource.license-selection.postgres.integration.test.ts','-t','paginates 51 authorized sources','--reporter=json','--outputFile='+resolve(out,'postgres-report.json')],cwd,source);
  save('backend-result',{source,...verifySelected(JSON.parse(readFileSync(resolve(out,'postgres-report.json'))),PG_CASES,4)});
 }else throw Error('Unknown PR364 phase');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)execute(process.argv[2]);
