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
export function verifyBuiltSource(){const m=JSON.parse(readFileSync(out+'/frontend-build-manifest.json'));assert.equal(m.source,git('rev-parse','HEAD'));assert.equal(m.frontendTree,binding.components.frontend);assert.equal(m.run,process.env.GITHUB_RUN_ID);assert.equal(m.attempt,process.env.GITHUB_RUN_ATTEMPT);assert.deepEqual(distFiles(),m.files);assert(m.files['index.html']&&m.files['.vite/manifest.json']);}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.version,'v24.21.0');const action=process.argv[2];mkdirSync(out,{recursive:true});
 for(const[c,t]of Object.entries(binding.components))assert.equal(git('rev-parse','HEAD:server-version/'+c),t,'Frozen application tree drift');
 if(action==='codeql-config'){const paths=[...Object.keys(binding.source),...binding.controls].filter(p=>/\.[cm]?[jt]sx?$/.test(p));assert(paths.length>30);for(const p of paths)assert(lstatSync(p).isFile()&&!lstatSync(p).isSymbolicLink());appendFileSync(process.env.GITHUB_OUTPUT,'config='+JSON.stringify({paths})+'\n');}
 else{
  const {changedEntries}=await import('./content-scope.mjs');const head=git('rev-parse','HEAD');assert.deepEqual(trainingPolishPlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));
  const e=loadEvidence();save('local-admission',verifyEvidence(e));
  if(action==='admission'){console.log('Admitted '+binding.admittedCases+' original assertions; no application checks executed.');}
  else if(action==='frontend'){
   if(binding.missingTests.length){run('missing-frontend-tests','server-version/frontend',['node_modules/vitest/vitest.mjs','run','--maxWorkers=2',...binding.missingTests.map(p=>p.slice('server-version/frontend/'.length)),'--reporter=json','--outputFile=../../'+out+'/missing-tests.json']);const j=JSON.parse(readFileSync(out+'/missing-tests.json'));assert.equal(j.numFailedTests,0);assert.equal(j.numPendingTests,0);assert(j.numPassedTests>0);}
   if(binding.missingLint.length)run('missing-frontend-lint','server-version/frontend',['node_modules/eslint/bin/eslint.js',...binding.missingLint.map(p=>p.slice('server-version/frontend/'.length))]);
   run('frontend-build','server-version/frontend',['node_modules/vite/bin/vite.js','build']);
   save('frontend-build-manifest',{source:head,sourceHead:process.env.CI_SOURCE_HEAD,frontendTree:binding.components.frontend,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,files:distFiles()});
  }else throw Error('Unknown exact qualification stage');
 }
}
