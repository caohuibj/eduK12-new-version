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
export function verifyTestRepairs(readOld,readCurrent){for(const[p,changes]of Object.entries(binding.resume.testRepairs)){let text=readOld(p);for(const x of changes){assert.equal(text.split(x.before).length-1,1,'Exact reviewed failed-case repair');text=text.replace(x.before,x.after);}assert.equal(readCurrent(p),text,'Changes outside reviewed failed case bodies');}}
async function restorePrior(){
 const b=binding.resume;assert(b);const api=async path=>{const r=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/'+path,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'}});assert.equal(r.status,200,'Official evidence unavailable');return r.json();};
 const [run,scope,job,artifact]=await Promise.all([api('actions/runs/'+b.run),api('actions/jobs/'+b.scopeJob),api('actions/jobs/'+b.job),api('actions/artifacts/'+b.artifact)]);
 assert.equal(run.head_sha,b.source);assert.equal(run.head_branch,'work/survey-governance-20261025');assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');assert(run.pull_requests.some(p=>p.number===354&&p.base.sha===binding.base));
 for(const[j,id,conclusion,name]of [[scope,b.scopeJob,'success','classify changed content'],[job,b.job,'failure','Survey governance / bounded qualification']]){assert.equal(j.id,id);assert.equal(j.run_id,b.run);assert.equal(j.head_sha,b.source);assert.equal(j.status,'completed');assert.equal(j.conclusion,conclusion);assert.equal(j.name,name);const age=Date.now()-Date.parse(j.completed_at);assert(age>=0&&age<86400000,'Original evidence expired');}
 for(const name of ['verify exact reviewed 20 local cases without replay','exact scope refusal evidence and fail-closed merge contracts','integrated affected backend and frontend types','changed frontend lint','Run actions/upload-artifact@v4'])assert(job.steps.some(s=>s.name===name&&s.status==='completed'&&s.conclusion==='success'),'Successful original stage missing: '+name);
 assert(job.steps.some(s=>s.name==='affected application consumers excluding admitted cases'&&s.conclusion==='failure'));
 assert.equal(artifact.id,b.artifact);assert.equal(artifact.expired,false);assert.equal(artifact.digest,'sha256:'+b.zipSHA256);assert.equal(artifact.workflow_run.id,b.run);assert.equal(artifact.workflow_run.head_sha,b.source);
 assert.equal(git('rev-parse',b.source+':server-version/backend'),binding.components.backend,'Backend input drift');
 for(const[p,blob]of Object.entries(binding.protectedInputs))assert.equal(git('rev-parse',b.source+':'+p),blob,'Original tool/config drift');
 const changed=git('diff','--name-only',b.source,'HEAD','--','server-version/frontend').split('\n').filter(Boolean).sort();assert.deepEqual(changed,Object.keys(b.testRepairs).sort());
 verifyTestRepairs(p=>execFileSync('git',['show',b.source+':'+p],{encoding:'utf8'}),p=>readFileSync(p,'utf8'));
 const response=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/actions/artifacts/'+b.artifact+'/zip',{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'}});assert.equal(response.status,200);const zip=Buffer.from(await response.arrayBuffer());assert(zip.length<2*1024*1024);assert.equal(sha(zip),b.zipSHA256);
 assert(process.env.RUNNER_TEMP);const z=process.env.RUNNER_TEMP+'/pr354-original-'+b.artifact+'.zip';writeFileSync(z,zip);
 const dir=out+'/original-'+b.run;mkdirSync(dir,{recursive:true});
 const program="import zipfile,pathlib,stat,sys\nz=zipfile.ZipFile(sys.argv[1]);out=pathlib.Path(sys.argv[2]);items=z.infolist();assert len(items)<100;assert sum(i.file_size for i in items)<20*1024*1024\nfor i in items:\n p=pathlib.PurePosixPath(i.filename);assert not p.is_absolute() and '..' not in p.parts and not stat.S_ISLNK(i.external_attr>>16);assert i.filename.startswith('survey-governance-evidence/')\n if i.is_dir():continue\n assert len(p.parts)==2 and p.suffix in ['.json','.log'];(out/p.name).write_bytes(z.read(i))\n";
 execFileSync('python3',['-c',program,z,dir],{stdio:'inherit'});
 for(const id of ['backend-types','frontend-types','frontend-lint','backend-unit']){const rec=JSON.parse(readFileSync(dir+'/'+id+'-execution.json'));assert.equal(rec.source,b.checkout);assert.equal(rec.sourceHead,b.source);assert.equal(String(rec.run),String(b.run));assert.equal(String(rec.attempt),'1');assert.equal(rec.exitCode,0);assert.equal(rec.signal,null);assert.equal(sha(readFileSync(dir+'/'+id+'.log')),rec.logSHA256);}
 const back=JSON.parse(readFileSync(dir+'/backend-unit.json'));assert.equal(verifyReport(back,binding.checks.backendUnit),109);
 const front=JSON.parse(readFileSync(dir+'/frontend-tests.json'));assert.equal(front.numPassedTests,207);assert.equal(front.numFailedTests,7);assert.equal(front.numPendingTests,0);assert.deepEqual(front.testResults.map(s=>'src/'+s.name.split('/src/').at(-1)).sort(),binding.checks.frontendTests.slice().sort());assert.deepEqual(front.testResults.flatMap(s=>s.assertionResults.filter(c=>c.status==='failed').map(c=>c.fullName)).sort(),b.failedFrontendCases.slice().sort());
 save('official-resume',{kind:'official-successful-subprocess-and-disjoint-assertion-reuse',source:b.source,checkout:b.checkout,originalRun:b.run,originalJob:b.job,originalConclusion:'failure',artifact:b.artifact,zipSHA256:b.zipSHA256,backendCases:109,frontendCases:207,pendingFailedCases:7});
}
function verifyFrontendDelta(report){const b=binding.resume,prior=JSON.parse(readFileSync(out+'/original-'+b.run+'/frontend-tests.json'));assert.equal(report.numFailedTests,0);assert.equal(report.numPassedTests,7);const passed=report.testResults.flatMap(s=>s.assertionResults.filter(c=>c.status==='passed').map(c=>c.fullName));assert.deepEqual(passed.sort(),b.failedFrontendCases.slice().sort());const previous=prior.testResults.flatMap(s=>s.assertionResults.filter(c=>c.status==='passed').map(c=>c.fullName));const all=new Set([...previous,...passed]);assert.equal(previous.length,207);assert.equal(all.size,214);assert.deepEqual([...all].sort(),prior.testResults.flatMap(s=>s.assertionResults.map(c=>c.fullName)).sort());save('frontend-tests-qualified',{cases:214,reused:207,executed:7,originalFailurePreserved:true});}

async function main(stage){
 if(stage==='resume'){await restorePrior();}
 else if(stage==='admission'){assert.equal(sha(readFileSync('.github/scripts/survey-governance-evidence.json')),binding.evidenceSHA256);save('local-admission',verifyEvidence(loadEvidence()));}
 else if(stage==='types'){
  if(!binding.resume)runRecorded('backend-types','backend',['node_modules/typescript/bin/tsc','--noEmit','--incremental','--tsBuildInfoFile',process.env.RUNNER_TEMP+'/survey-governance-backend.tsbuildinfo']);
  runRecorded('frontend-types','frontend',['node_modules/typescript/bin/tsc','-p','tsconfig.app.json','--noEmit','--incremental','--tsBuildInfoFile',process.env.RUNNER_TEMP+'/survey-governance-frontend.tsbuildinfo']);
 }
 else if(stage==='lint'){const files=binding.resume?Object.keys(binding.resume.testRepairs).map(p=>p.slice('server-version/frontend/'.length)):binding.checks.lint;assert(files.length>0);runRecorded('frontend-lint','frontend',['node_modules/eslint/bin/eslint.js',...files]);}
 else if(stage==='unit'){
  if(!binding.resume){tests('backend',binding.checks.backendUnit,'backend-unit');tests('frontend',binding.checks.frontendTests,'frontend-tests');}
  else{assert(existsSync(out+'/official-resume.json'),'Missing actual original admission');const files=Object.keys(binding.resume.testRepairs).map(p=>p.slice('server-version/frontend/'.length));const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),pattern='^(?:'+binding.resume.failedFrontendCases.map(escape).join('|')+')$';runRecorded('frontend-delta','frontend',['node_modules/vitest/vitest.mjs','run',...files,'--testNamePattern='+pattern,'--maxWorkers=2','--reporter=json','--outputFile=../../'+out+'/frontend-delta.json']);verifyFrontendDelta(JSON.parse(readFileSync(out+'/frontend-delta.json')));}
 }
 else if(stage==='postgres'){
  for(const [id,file,database,flag]of binding.checks.postgres){const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55433');u.pathname='/'+database;tests('backend',[file],id,{DATABASE_URL:u.href,[flag]:'1'});}
 }
 else if(stage==='build'){runRecorded('frontend-build','frontend',['node_modules/vite/bin/vite.js','build']);manifest();}
 else throw Error('Unknown exact qualification stage '+stage);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main(process.argv[2]);
