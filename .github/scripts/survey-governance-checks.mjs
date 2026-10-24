import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {binding} from './survey-governance-scope.mjs';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const out='survey-governance-evidence';
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
export function loadEvidence(){return JSON.parse(readFileSync(new URL('./survey-governance-evidence.json',import.meta.url)));}
export function verifyEvidence(e,read=p=>readFileSync(p)){
 assert.equal(e.kind,'reviewed-local-evidence');assert.equal(e.ciExecuted,false);assert.equal(e.originalExecutionSigned,false);
 const unique=new Set();let cases=0;
 for(const suite of e.suites){
  assert(suite.expected>0);assert(Object.hasOwn(suite.inputSHA256,suite.entry));
  for(const[p,h]of Object.entries(suite.inputSHA256))assert.equal(sha(read(p)),h,'Admitted input drift: '+p);
  let count=0;
  for(const name of suite.reports){const source=e.reports[name];assert(source);const raw=Buffer.from(source.base64,'base64');assert.equal(sha(raw),source.sha256,'Original reporter changed');const report=JSON.parse(raw);
   const rows=report.testResults.filter(s=>s.name.endsWith('/'+suite.entry.split('/').slice(2).join('/')));assert.equal(rows.length,1,'Exact original suite required');
   for(const c of rows[0].assertionResults.filter(c=>c.status==='passed')){const key=suite.entry+'\0'+c.fullName;assert(!unique.has(key),'Duplicate admitted case');unique.add(key);count++;}
   assert(rows[0].assertionResults.every(c=>['passed','pending','skipped','todo'].includes(c.status)),'Original failures cannot qualify');
  }
  assert.equal(count,suite.expected);cases+=count;
 }
 assert.equal(cases,20);return {kind:e.kind,ciExecuted:false,originalExecutionSigned:false,cases,names:[...unique]};
}
function save(name,value){mkdirSync(out,{recursive:true});writeFileSync(out+'/'+name+'.json',JSON.stringify(value,null,2)+'\n');}
export function runRecorded(id,component,args,env={}){
 mkdirSync(out,{recursive:true});const start=new Date().toISOString(),command=[process.execPath,...args];
 const result=spawnSync(process.execPath,args,{cwd:'server-version/'+component,env:{...process.env,...env},encoding:'utf8',maxBuffer:64*1024*1024});
 const log=(result.stdout||'')+(result.stderr||'');writeFileSync(out+'/'+id+'.log',log);process.stdout.write(log);
 save(id+'-execution',{source:git('rev-parse','HEAD'),sourceHead:process.env.CI_SOURCE_HEAD,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,componentTree:git('rev-parse','HEAD:server-version/'+component),start,finish:new Date().toISOString(),command,exitCode:result.status,signal:result.signal,logSHA256:sha(log)});
 assert.equal(result.status,0,id+' failed');assert.equal(result.signal,null);return result;
}
export function verifyReport(r,files){
 assert.equal(r.numFailedTests,0);assert.equal(r.numPendingTests,0);assert(r.numPassedTests>0,'No empty test success');
 assert.deepEqual(r.testResults.map(s=>'src/'+s.name.split('/src/').at(-1)).sort(),files.slice().sort(),'Exact selected suite set');
 const cs=r.testResults.flatMap(s=>s.assertionResults);assert(cs.length>0);assert(cs.every(c=>c.status==='passed'),'Skipped or failed selected test');return cs.length;
}
function tests(component,files,id,extra={}){
 const file=out+'/'+id+'.json';runRecorded(id,component,['node_modules/vitest/vitest.mjs','run',...files,'--maxWorkers=2','--reporter=json','--outputFile=../../'+file],extra);
 save(id+'-qualified',{cases:verifyReport(JSON.parse(readFileSync(file)),files),files});
}
function manifest(){const files={};function walk(dir){for(const n of readdirSync(dir)){const p=dir+'/'+n;if(lstatSync(p).isDirectory())walk(p);else{assert(lstatSync(p).isFile());files[p.slice('server-version/frontend/dist/'.length)]={bytes:readFileSync(p).length,sha256:sha(readFileSync(p))};}}}walk('server-version/frontend/dist');
 assert(files['index.html']);assert(Object.keys(files).some(n=>/^assets\/.*\.js$/.test(n)));
 save('frontend-build-manifest',{source:git('rev-parse','HEAD'),sourceHead:process.env.CI_SOURCE_HEAD,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,componentTree:binding.components.frontend,files});
}
async function main(stage){
 if(stage==='admission'){assert.equal(sha(readFileSync('.github/scripts/survey-governance-evidence.json')),binding.evidenceSHA256);save('local-admission',verifyEvidence(loadEvidence()));}
 else if(stage==='types'){
  runRecorded('backend-types','backend',['node_modules/typescript/bin/tsc','--noEmit','--incremental','--tsBuildInfoFile',process.env.RUNNER_TEMP+'/survey-governance-backend.tsbuildinfo']);
  runRecorded('frontend-types','frontend',['node_modules/typescript/bin/tsc','-p','tsconfig.app.json','--noEmit','--incremental','--tsBuildInfoFile',process.env.RUNNER_TEMP+'/survey-governance-frontend.tsbuildinfo']);
 }
 else if(stage==='lint'){const files=binding.checks.lint;assert(files.length>0);runRecorded('frontend-lint','frontend',['node_modules/eslint/bin/eslint.js',...files]);}
 else if(stage==='unit'){tests('backend',binding.checks.backendUnit,'backend-unit');tests('frontend',binding.checks.frontendTests,'frontend-tests');}
 else if(stage==='postgres'){
  for(const [id,file,database,flag]of binding.checks.postgres){const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55433');u.pathname='/'+database;tests('backend',[file],id,{DATABASE_URL:u.href,[flag]:'1'});}
 }
 else if(stage==='build'){runRecorded('frontend-build','frontend',['node_modules/vite/bin/vite.js','build']);manifest();}
 else throw Error('Unknown exact qualification stage '+stage);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main(process.argv[2]);
