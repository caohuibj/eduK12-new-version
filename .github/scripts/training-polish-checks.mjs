import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';import {gunzipSync} from 'node:zlib';import {execFileSync,spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {binding,trainingPolishPlan} from './training-polish-scope.mjs';
export const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const out='training-polish-evidence';const save=(n,v)=>{mkdirSync(out,{recursive:true});writeFileSync(out+'/'+n+'.json',JSON.stringify(v,null,2)+'\n');};
export function verifyEvidence(e,read=readFileSync){
 assert.equal(e.kind,'reviewed-local-evidence');assert.equal(e.ciExecuted,false);assert.equal(e.originalExecutionSigned,false);
 assert.equal(e.product,binding.product);assert.equal(e.base,binding.base);
 const reports={};for(const[k,v]of Object.entries(e.reports)){const raw=gunzipSync(Buffer.from(v.gzipBase64,'base64'),{maxOutputLength:8*1024*1024});assert.equal(raw.length,v.bytes);assert.equal(sha(raw),v.sha256);reports[k]=JSON.parse(raw);}
 const seen=new Set();
 for(const a of e.acceptedSuites){const j=reports[a.report],suite=j.testResults.find(s=>s.name.endsWith('/'+a.file.split('/server-version/').pop().replace(/^(frontend|backend)\//,''))||s.name.endsWith('/'+a.file.slice(a.file.indexOf('/src/')+1)));assert(suite,'Original suite missing');
  assert.equal(suite.status,'passed');assert.deepEqual(suite.assertionResults.map(x=>x.fullName),a.cases,'Complete original suite required');
  for(const c of suite.assertionResults){assert.equal(c.status,'passed');assert((c.failureMessages||[]).length===0);const k=a.file+'\0'+c.fullName;assert(!seen.has(k),'Duplicate admitted case');seen.add(k);}
  for(const[p,h]of Object.entries(a.inputSHA256||{}))assert.equal(sha(read(p)),h,'Imported source drift: '+p);
 }
 assert.equal(seen.size,binding.admittedCases);assert.equal(reports['integrated-ui-tests'].numPassedTests,203);assert.equal(reports['backend-inbox-contracts'].numPassedTests,28);
 for(const n of ['integrated-ui-tests','backend-inbox-contracts']){assert.equal(reports[n].numFailedTests,0);assert.equal(e.executions[n].exitCode,0);}
 for(const name of ['frontend-types-repair','backend-scope-types-final','integrated-lint'])assert.equal(e.executions[name].exitCode,0,'Original execution failed');
 assert(e.executions['frontend-types-repair'].args.includes('tsconfig.app.json'));assert(e.executions['frontend-types-repair'].args.includes('--noEmit'));
 assert(e.executions['backend-scope-types-final'].args.some(a=>a.endsWith('/tsconfig.backend-scoped.json')));
 assert.equal(e.backendScopedConfig.extends,'/Users/Qiang/projects/eduk12-main-20261018/server-version/backend/tsconfig.json');
 assert(e.backendScopedConfig.files.some(f=>f.endsWith('/middleware/auth.ts')),'Original Request augmentation required');
 for(const a of e.lint){assert.equal(a.exitCode,0);assert.equal(a.execution.exitCode,0);assert.equal(a.execution.args[0],'node_modules/eslint/bin/eslint.js');assert(a.execution.args.includes(a.file.slice('server-version/frontend/'.length)));assert.equal(sha(read(a.file)),a.inputSHA256,'Lint source drift');}
 for(const[p,h]of Object.entries(e.controlSHA256))assert.equal(sha(read(p)),h,'Reviewed control drift');
 for(const[p,h]of Object.entries(e.configurationSHA256))assert.equal(sha(read(p)),h,'Check configuration drift');
 return {kind:e.kind,ciExecuted:false,originalExecutionSigned:false,cases:seen.size,lintFiles:e.lint.length,fullFrontendTypes:'reviewed local exit 0',backendTypes:'reviewed affected closure exit 0',limits:e.limits};
}
export function loadEvidence(){const raw=readFileSync('.github/evidence/training-polish/reviewed-local.json');assert.equal(sha(raw),binding.evidenceSHA256,'Evidence drift');return JSON.parse(raw);}
function run(id,cwd,args){const record={source:git('rev-parse','HEAD'),sourceHead:process.env.CI_SOURCE_HEAD,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,cwd,argv:['node',...args],node:process.version,startedAt:new Date().toISOString(),ciExecuted:true};save(id+'-execution',record);
 const r=spawnSync(process.execPath,args,{cwd,encoding:'utf8',env:process.env,maxBuffer:32*1024*1024});const log=(r.stdout||'')+(r.stderr||'');writeFileSync(out+'/'+id+'.log',log);process.stdout.write(log);
 Object.assign(record,{completedAt:new Date().toISOString(),exitCode:r.status,signal:r.signal,error:r.error?.message||null,logSHA256:sha(log)});save(id+'-execution',record);assert.equal(r.status,0,id+' failed');assert(!r.error);return record;
}
function distFiles(){const files={};const walk=p=>{for(const n of readdirSync(p,{withFileTypes:true})){const f=p+'/'+n.name;assert(!lstatSync(f).isSymbolicLink());if(n.isDirectory())walk(f);else{assert(n.isFile());const b=readFileSync(f);files[f.slice('server-version/frontend/dist/'.length)]={sha256:sha(b),bytes:b.length};}}};walk('server-version/frontend/dist');return files;}
export function verifyBuiltSource(){const m=JSON.parse(readFileSync(out+'/frontend-build-manifest.json'));assert.equal(m.frontendTree,binding.components.frontend);assert.deepEqual(distFiles(),m.files);verifyManifest(m,distFiles(),binding.resume||{checkout:git('rev-parse','HEAD'),source:process.env.CI_SOURCE_HEAD,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT});verifyHtmlEntry(readFileSync('server-version/frontend/dist/index.html','utf8'),m.files);}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.version,'v24.21.0');const action=process.argv[2];mkdirSync(out,{recursive:true});
 for(const[c,t]of Object.entries(binding.components))assert.equal(git('rev-parse','HEAD:server-version/'+c),t,'Frozen application tree drift');
 if(action==='codeql-config'){const paths=binding.resume?await verifyPriorSast():[...Object.keys(binding.source),...binding.controls].filter(p=>/\.[cm]?[jt]sx?$/.test(p));assert(paths.length>0);for(const p of paths)assert(lstatSync(p).isFile()&&!lstatSync(p).isSymbolicLink());appendFileSync(process.env.GITHUB_OUTPUT,'config='+JSON.stringify({paths})+'\n');}
 else{
  const {changedEntries}=await import('./content-scope.mjs');const head=git('rev-parse','HEAD');assert.deepEqual(trainingPolishPlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));
  const e=loadEvidence();save('local-admission',verifyEvidence(e));
  if(action==='admission'){console.log('Admitted '+binding.admittedCases+' original assertions; no application checks executed.');}
  else if(action==='restore'){await restorePrior();}
  else if(action==='frontend'){
   if(binding.missingTests.length){run('missing-frontend-tests','server-version/frontend',['node_modules/vitest/vitest.mjs','run','--maxWorkers=2',...binding.missingTests.map(p=>p.slice('server-version/frontend/'.length)),'--reporter=json','--outputFile=../../'+out+'/missing-tests.json']);const j=JSON.parse(readFileSync(out+'/missing-tests.json'));assert.equal(j.numFailedTests,0);assert.equal(j.numPendingTests,0);assert(j.numPassedTests>0);}
   if(binding.missingLint.length)run('missing-frontend-lint','server-version/frontend',['node_modules/eslint/bin/eslint.js',...binding.missingLint.map(p=>p.slice('server-version/frontend/'.length))]);
   run('frontend-build','server-version/frontend',['node_modules/vite/bin/vite.js','build']);
   save('frontend-build-manifest',{source:head,sourceHead:process.env.CI_SOURCE_HEAD,frontendTree:binding.components.frontend,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,files:distFiles()});
  }else throw Error('Unknown exact qualification stage');
 }
}


async function official(path){assert.equal(process.env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');assert(process.env.GH_TOKEN,'Official Actions read token missing');
 const r=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/'+path,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});assert.equal(r.status,200,'Official metadata unavailable: '+path);return r.json();}
function recentJob(j,id,name,conclusion,b=binding.resume){assert.equal(j.id,id);assert.equal(j.run_id,b.run);assert.equal(j.head_sha,b.source);assert.equal(j.name,name);assert.equal(j.status,'completed');assert.equal(j.conclusion,conclusion);const age=Date.now()-Date.parse(j.completed_at);assert(age>=0&&age<86400000,'Original job expired');}
export function verifyManifest(m,actual,expected){assert.equal(m.source,expected.checkout);assert.equal(m.sourceHead,expected.source);assert.equal(m.frontendTree,binding.components.frontend);assert.equal(String(m.run),String(expected.run));assert.equal(String(m.attempt),String(expected.attempt));assert.deepEqual(actual,m.files,'Actual emitted files changed');assert(m.files['index.html'],'Compiled HTML missing');assert(Object.keys(m.files).some(p=>p.startsWith('assets/')&&p.endsWith('.js')),'Compiled runtime asset missing');}
export function verifyHtmlEntry(html,files){const scripts=[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m=>m[1].replace(/^\//,''));assert(scripts.some(p=>p.startsWith('assets/')&&p.endsWith('.js')&&files[p]),'Compiled HTML does not reference a retained runtime asset');}
function ensureOriginalSource(source=binding.resume.source){const exists=spawnSync('git',['cat-file','-e',source+'^{commit}'],{stdio:'ignore'});if(exists.status!==0)execFileSync('git',['fetch','--no-tags','--depth=1','origin',source],{stdio:'inherit'});}
async function verifyPriorSast(){const b=binding.resume;assert(b,'Only fixed official qualification reuse permitted');
 const [run,scope,job]=await Promise.all([official('actions/runs/'+b.run),official('actions/jobs/'+b.scopeJob),official('actions/jobs/'+b.sastJob)]);
 assert.equal(run.head_sha,b.source);assert.equal(run.head_branch,'work/survey-training-branding-20261023');assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');assert(run.pull_requests.some(p=>p.number===352&&p.base.sha===binding.base));
 recentJob(scope,b.scopeJob,'classify changed content','success');recentJob(job,b.sastJob,'codeql (javascript/typescript SAST)','success');
 for(const n of ['initialize CodeQL','analyze with CodeQL'])assert(job.steps.some(s=>s.name===n&&s.status==='completed'&&s.conclusion==='success'),'Original SAST analysis missing');
 ensureOriginalSource();for(const[c,t]of Object.entries(binding.components))assert.equal(git('rev-parse',b.source+':server-version/'+c),t);
 const old=execFileSync('git',['show',b.source+':.github/workflows/ci.yml'],{encoding:'utf8'}),now=readFileSync('.github/workflows/ci.yml','utf8');
 const stage=(text,name)=>{const start=text.indexOf('      - name: '+name+'\n');assert(start>=0);const end=text.indexOf('\n      - ',start+1);return text.slice(start,end<0?undefined:end).trim();};
 for(const name of ['initialize CodeQL','analyze with CodeQL'])assert.equal(stage(old,name),stage(now,name),'CodeQL version/options changed');
 const chain=binding.priorSast;assert(chain);const [secondRun,secondScope,secondJob]=await Promise.all([official('actions/runs/'+chain.run),official('actions/jobs/'+chain.scopeJob),official('actions/jobs/'+chain.sastJob)]);
 assert.equal(secondRun.head_sha,chain.source);assert.equal(secondRun.event,'pull_request');assert.equal(secondRun.path,'.github/workflows/ci.yml');assert(secondRun.pull_requests.some(p=>p.number===352&&p.base.sha===binding.base));
 recentJob(secondScope,chain.scopeJob,'classify changed content','success',chain);recentJob(secondJob,chain.sastJob,'codeql (javascript/typescript SAST)','success',chain);
 for(const n of ['select exact PR352 application and control SAST inputs','initialize CodeQL','analyze with CodeQL'])assert(secondJob.steps.some(s=>s.name===n&&s.status==='completed'&&s.conclusion==='success'));
 ensureOriginalSource(chain.source);const previousBinding=JSON.parse(execFileSync('git',['show',chain.source+':.github/scripts/training-polish-bindings.json'],{encoding:'utf8'}));assert.deepEqual(previousBinding.resume,binding.resume,'Prior selected-analysis chain differs');
 const changed=b.sastChangedControls;for(const p of [...Object.keys(binding.source),...binding.controls].filter(p=>/\.[cm]?[jt]sx?$/.test(p)&&!changed.includes(p)))assert.equal(git('rev-parse','HEAD:'+p),git('rev-parse',chain.source+':'+p),'Unchanged SAST source drift: '+p);
 save('prior-sast',{kind:'official-completed-analysis-reuse',originalRun:b.run,originalJob:b.sastJob,source:b.source,current:git('rev-parse','HEAD'),originalRunConclusion:run.conclusion,applicationRescanned:false,continuedOriginalRun:chain.run,continuedOriginalJob:chain.sastJob,continuedSource:chain.source,changedControls:changed});return changed;
}
async function restorePrior(){const b=binding.resume;assert(b,'No generic artifact fallback');const [run,scope,job,a]=await Promise.all([official('actions/runs/'+b.run),official('actions/jobs/'+b.scopeJob),official('actions/jobs/'+b.qualificationJob),official('actions/artifacts/'+b.artifact)]);
 assert.equal(run.head_sha,b.source);assert.equal(run.head_branch,'work/survey-training-branding-20261023');assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');assert(run.pull_requests.some(p=>p.number===352&&p.base.sha===binding.base));
 recentJob(scope,b.scopeJob,'classify changed content','success');recentJob(job,b.qualificationJob,'Training non-permission bounded qualification','failure');
 for(const n of ['verify exact reviewed local evidence without replaying accepted application checks','new scope refusal evidence and fail-closed merge contracts','only missing frontend assertions lint and one production frontend compilation','Run actions/upload-artifact@v4'])assert(job.steps.some(s=>s.name===n&&s.status==='completed'&&s.conclusion==='success'),'Original successful stage missing: '+n);
 assert(job.steps.some(s=>s.name==='compiled Training light dark narrow layout filters and read-only shortcuts'&&s.conclusion==='failure'),'Original failed browser stage must stay failed');
 assert.equal(a.id,b.artifact);assert.equal(a.expired,false);assert.equal(a.digest,'sha256:'+b.zipSHA256);assert.equal(a.workflow_run.id,b.run);assert.equal(a.workflow_run.head_sha,b.source);assert.equal(a.workflow_run.repository_id,1338215995);
 ensureOriginalSource();for(const[c,t]of Object.entries(binding.components))assert.equal(git('rev-parse',b.source+':server-version/'+c),t);
 const r=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/actions/artifacts/'+b.artifact+'/zip',{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'}});assert.equal(r.status,200);const zip=Buffer.from(await r.arrayBuffer());assert(zip.length<50*1024*1024);assert.equal(sha(zip),b.zipSHA256,'Official ZIP digest mismatch');assert(process.env.RUNNER_TEMP);const z=process.env.RUNNER_TEMP+'/training-polish-original-'+b.artifact+'.zip';writeFileSync(z,zip);
 const script="import zipfile,pathlib,stat,sys\nz=zipfile.ZipFile(sys.argv[1]);root=pathlib.Path('.').resolve();items=z.infolist();assert len(items)<2000;assert sum(i.file_size for i in items)<120*1024*1024\nfor i in items:\n p=pathlib.PurePosixPath(i.filename);assert not p.is_absolute() and '..' not in p.parts;assert not stat.S_ISLNK(i.external_attr>>16);assert i.filename.startswith(('training-polish-evidence/','server-version/frontend/dist/'))\n if i.is_dir():continue\n f=root/pathlib.Path(*p.parts);f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(z.read(i))\n";
 execFileSync('python3',['-c',script,z],{stdio:'inherit'});
 const m=JSON.parse(readFileSync(out+'/frontend-build-manifest.json'));verifyManifest(m,distFiles(),b);verifyHtmlEntry(readFileSync('server-version/frontend/dist/index.html','utf8'),m.files);
 const reports=JSON.parse(readFileSync(out+'/missing-tests.json'));assert.equal(reports.numFailedTests,0);assert.equal(reports.numPendingTests,0);assert(reports.numPassedTests>0);assert.deepEqual(reports.testResults.map(s=>'server-version/frontend/'+s.name.split('/server-version/frontend/').pop()).sort(),binding.missingTests.slice().sort());for(const suite of reports.testResults){assert.equal(suite.status,'passed');assert(suite.assertionResults.length>0);assert(suite.assertionResults.every(a=>a.status==='passed'));}
 for(const id of ['missing-frontend-tests','missing-frontend-lint','frontend-build']){const x=JSON.parse(readFileSync(out+'/'+id+'-execution.json'));assert.equal(x.source,b.checkout);assert.equal(x.sourceHead,b.source);assert.equal(String(x.run),String(b.run));assert.equal(String(x.attempt),String(b.attempt));assert.equal(x.exitCode,0);assert.equal(x.signal,null);assert.equal(sha(readFileSync(out+'/'+id+'.log')),x.logSHA256,'Original subprocess log changed');}
 save('original-qualified',{kind:'official-successful-subprocess-and-build-reuse',currentSource:git('rev-parse','HEAD'),originalRun:b.run,originalJob:b.qualificationJob,originalJobConclusion:job.conclusion,artifact:b.artifact,zipSHA256:b.zipSHA256,cases:reports.numPassedTests,frontendBuildRepeated:false});
 await restoreBrowserPrior();
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'restored=true\n');console.log('Reused original successful frontend '+reports.numPassedTests+' assertions, lint and complete emitted build; original job remains failed.');
}


export function verifyBrowserReceipt(r,expected){assert.deepEqual(r.unexpected,[]);assert.deepEqual(r.errors,[]);assert.deepEqual(r.checks,expected);assert.equal(new Set(r.checks).size,r.checks.length);assert(r.url.includes('/student/courses/c1'));assert(r.error.includes('2 !== 1'),'Original race failure must remain failed');assert(!r.checks.includes('student-assignments-completed-light'));return r.checks;}
async function restoreBrowserPrior(){const b=binding.priorBrowser;assert(b);const [run,scope,job,a]=await Promise.all([official('actions/runs/'+b.run),official('actions/jobs/'+b.scopeJob),official('actions/jobs/'+b.qualificationJob),official('actions/artifacts/'+b.artifact)]);
 assert.equal(run.head_sha,b.source);assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');assert(run.pull_requests.some(p=>p.number===352&&p.base.sha===binding.base));
 recentJob(scope,b.scopeJob,'classify changed content','success',b);recentJob(job,b.qualificationJob,'Training non-permission bounded qualification','failure',b);
 for(const name of ['restore exact successful frontend subprocesses and immutable compiled artifact','new scope refusal evidence and fail-closed merge contracts'])assert(job.steps.some(s=>s.name===name&&s.conclusion==='success'&&s.status==='completed'));
 assert(job.steps.some(s=>s.name==='compiled Training light dark narrow layout filters and read-only shortcuts'&&s.conclusion==='failure'));
 assert.equal(a.id,b.artifact);assert.equal(a.expired,false);assert.equal(a.digest,'sha256:'+b.zipSHA256);assert.equal(a.workflow_run.id,b.run);assert.equal(a.workflow_run.head_sha,b.source);
 ensureOriginalSource(b.source);assert.equal(sha(execFileSync('git',['show',b.source+':.github/scripts/training-polish-browser.mjs'])),b.browserProgramSHA256);
 const r=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/actions/artifacts/'+b.artifact+'/zip',{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'}});assert.equal(r.status,200);const zip=Buffer.from(await r.arrayBuffer());assert(zip.length<50*1024*1024);assert.equal(sha(zip),b.zipSHA256);const z=process.env.RUNNER_TEMP+'/training-polish-browser-'+b.artifact+'.zip';writeFileSync(z,zip);
 const script="import zipfile,pathlib,stat,sys,json\nz=zipfile.ZipFile(sys.argv[1]);out=pathlib.Path('training-polish-evidence');expected=json.loads(sys.argv[2]);items=z.infolist();assert len(items)<2000;assert sum(i.file_size for i in items)<120*1024*1024\nfor i in items:\n p=pathlib.PurePosixPath(i.filename);assert not p.is_absolute() and '..' not in p.parts and not stat.S_ISLNK(i.external_attr>>16)\nraw=z.read('training-polish-evidence/browser-failure.json');(out/'original-browser-failure.json').write_bytes(raw)\nfor name in expected:\n raw=z.read('training-polish-evidence/'+name+'.png');assert raw.startswith(bytes.fromhex('89504e470d0a1a0a'));(out/(name+'.png')).write_bytes(raw)\n";
 execFileSync('python3',['-c',script,z,JSON.stringify(b.cases)],{stdio:'inherit'});
 const report=JSON.parse(readFileSync(out+'/original-browser-failure.json'));verifyBrowserReceipt(report,b.cases);
 save('prior-browser',{kind:'official-unchanged-compiled-browser-case-reuse',currentSource:git('rev-parse','HEAD'),source:b.source,originalRun:b.run,originalJob:b.qualificationJob,originalConclusion:job.conclusion,artifact:b.artifact,zipSHA256:b.zipSHA256,checks:b.cases,images:Object.fromEntries(b.cases.map(n=>[n,sha(readFileSync(out+'/'+n+'.png'))]))});
 console.log('Retained '+b.cases.length+' actual prior browser passes; only missing cases will execute.');
}
