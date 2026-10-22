import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {binding,surveyExperiencePlan} from './survey-experience-scope.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const out='survey-experience-evidence';
const run=(cmd,args,options={})=>execFileSync(cmd,args,{stdio:'inherit',...options});
export function decodeLocal(bytes){
 assert.equal(sha(bytes),binding.localEvidenceSHA256,'Reviewed local record changed');
 const record=JSON.parse(bytes);assert.equal(record.ciExecuted,false);assert.equal(record.signed,false);assert.equal(record.productHead,binding.productHead);assert.equal(record.frontendTree,binding.frontendTree);assert.equal(record.node,'24.21.0');
 const reports={};for(const[name,r]of Object.entries(record.reports)){const b=gunzipSync(Buffer.from(r.gzipBase64,'base64'));assert.equal(b.length,r.bytes);assert.equal(sha(b),r.sha256,name);reports[name]=b;}
 const parse=n=>JSON.parse(reports[n]);
 const current=parse('batch2/tests.json');assert.equal(current.success,true);assert.equal(current.numPassedTests,159);assert.equal(current.numFailedTests,0);assert.equal(current.testResults.length,13);
 for(const s of current.testResults){assert.equal(s.status,'passed');assert.ok(s.assertionResults.length);for(const a of s.assertionResults)assert.equal(a.status,'passed');}
 const builder=parse('batch2/builder-tests.json');assert.equal(builder.success,true);assert.equal(builder.numPassedTests,3);assert.equal(builder.numFailedTests,0);assert.equal(builder.testResults.length,1);assert.equal(builder.testResults[0].status,'passed');assert.equal(builder.testResults[0].assertionResults.length,8);assert.equal(builder.testResults[0].assertionResults.filter(a=>a.status==='skipped').length,5);
 const titles=['supports self-authored shared-response scales with reverse items and dimension assignment','freezes author-selected Scale one-by-one mode and previews a single question','C05 shared structured constraints preserve Survey V2 total zero and row choice bounds'];
 assert.deepEqual(builder.testResults.flatMap(s=>s.assertionResults).filter(a=>a.status==='passed').map(a=>a.title).sort(),titles.sort());
 const initial=parse('candidate-pre-review.json');for(const name of ['ResearchCatalog.tsx','ResearchCatalog.test.tsx','SurveyApp.tsx','SurveyApp.leave-risk.test.tsx','SurveyFormPagination.test.tsx']){const path='server-version/frontend/src/survey/'+name;if(initial.source[path])assert.equal(sha(readFileSync(path)),initial.source[path],path);}
 const prior=parse('tests-corrected.json');assert.equal(prior.success,false,'Original failed aggregate is preserved');
 const names=['ResearchCatalog.test.tsx','SurveyApp.leave-risk.test.tsx','SurveyFormPagination.test.tsx'];const reused=prior.testResults.filter(s=>names.some(n=>s.name.endsWith('/'+n)));assert.equal(reused.length,3);assert.equal(reused.flatMap(s=>s.assertionResults).length,19);for(const s of reused){assert.equal(s.status,'passed');for(const a of s.assertionResults)assert.equal(a.status,'passed');}
 const env=parse('dependency-inventory.json');assert.equal(env.installedVersionMatches,393);assert.deepEqual(env.mismatches,[]);assert.equal(env.cachedPackageIntegrityReverified,false);assert.equal(sha(readFileSync('server-version/frontend/package-lock.json')),env.lockSha256);const summary=parse('batch2/validation-summary.json');assert.equal(summary.newExecution.appTypes,'PASS');assert.equal(summary.newExecution.changedSourceLint,'PASS zero errors; 2 hook dependency warnings retained');for(const [name,r]of Object.entries(summary.files)){if(reports['batch2/'+name])assert.equal(sha(reports['batch2/'+name]),r.sha256);}for(const [path,digest]of Object.entries(parse('batch2/source-manifest.json').files))assert.equal(sha(readFileSync(path)),digest,path);assert.equal(reports['batch2/types.log'].length,0);assert.ok(!reports['batch2/lint.log'].toString().includes(' error '));
 return {schema:1,status:'ACCEPTED_REVIEWED_LOCAL',ciExecuted:false,signed:false,localEvidenceSha256:sha(bytes),newPassed:162,priorApplicablePassed:19,limitations:record.limitations,types:'local exit 0',lint:'local exit 0 with disclosed warnings'};
}
function files(dir,prefix=''){return Object.fromEntries(readdirSync(dir).sort().flatMap(name=>{const path=dir+'/'+name,key=prefix+name;return statSync(path).isDirectory()?Object.entries(files(path,key+'/')):[[key,sha(readFileSync(path))]];}));}
async function main(mode){
 mkdirSync(out,{recursive:true});
 if(mode==='admit'){
  const {changedEntries}=await import('./content-scope.mjs');const p=JSON.parse(process.env.PLAN);const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.deepEqual(p,surveyExperiencePlan(changedEntries(p.base,head),p.base,head));
  writeFileSync(out+'/local-admission.json',JSON.stringify(decodeLocal(readFileSync('.github/scripts/survey-experience-local.json')),null,2));return;
 }
 if(mode==='build'){
  const head=process.env.GITHUB_SHA;assert.match(head,/^[a-f0-9]{40}$/);const builder='survey-experience-builder:'+head,runtime='survey-experience-runtime:'+head;
  for(const target of ['build','runtime'])run('docker',['build','--target',target,'--build-arg','NPM_REGISTRY=https://registry.npmjs.org','--build-arg','VITE_COGNITIVE_MODULE_ENABLED=true','--label','org.opencontainers.image.revision='+head,'-t',target==='build'?builder:runtime,'server-version/frontend']);
  writeFileSync(out+'/images.json',execFileSync('docker',['image','inspect',builder,runtime]));mkdirSync('survey-experience-images',{recursive:true});run('bash',['-euo','pipefail','-c',`docker save '${builder}' '${runtime}' | gzip -1 > survey-experience-images/images.tar.gz`]);
  writeFileSync(out+'/images.sha256',execFileSync('sha256sum',['survey-experience-images/images.tar.gz']));
  for(const[kind,image,location]of [['builder',builder,'/app/dist'],['runtime',runtime,'/usr/share/nginx/html']]){
   const id=execFileSync('docker',['create',image],{encoding:'utf8'}).trim();try{mkdirSync(out+'/'+kind,{recursive:true});run('docker',['cp',id+':'+location+'/.',out+'/'+kind+'/']);}finally{run('docker',['rm',id]);}
  }
  const built=files(out+'/builder'),served=files(out+'/runtime');assert.ok(Object.keys(built).length);for(const[k,v]of Object.entries(built))assert.equal(served[k],v,k);assert.ok(Object.keys(served).filter(k=>!Object.hasOwn(built,k)).every(k=>k==='50x.html'));
  writeFileSync(out+'/runtime-files.json',JSON.stringify(built,null,2));writeFileSync(out+'/build.json',JSON.stringify({status:'PASS',head,run:process.env.GITHUB_RUN_ID,builder,runtime,distManifestSHA256:sha(readFileSync(out+'/runtime-files.json')),compilation:'one build stage; runtime target consumes cached same dist'}));return;
 }
 if(mode==='audit'){
  let output;try{output=execFileSync('docker',['run','--rm','survey-experience-builder:'+process.env.GITHUB_SHA,'npm','audit','--audit-level=high','--json'],{encoding:'utf8'});}catch(e){if(e.stdout)writeFileSync(out+'/audit.json',e.stdout);throw e;}writeFileSync(out+'/audit.json',output);const j=JSON.parse(output);assert.equal(j.metadata.vulnerabilities.high,0);assert.equal(j.metadata.vulnerabilities.critical,0);return;
 }
 if(mode==='browser-report'){
  const j=JSON.parse(readFileSync(out+'/browser/browser.json')),build=JSON.parse(readFileSync(out+'/build.json'));
  assert.equal(j.status,'passed');assert.equal(j.scope,'synthetic-production-frontend-ui-only');assert.equal(j.sourceCommit,process.env.GITHUB_SHA);assert.equal(String(j.ciRunId),process.env.GITHUB_RUN_ID);
  const {REQUIRED}=createRequire(import.meta.url)('./survey-experience-browser.cjs');assert.deepEqual(j.required,REQUIRED);assert.deepEqual(j.checks,REQUIRED.map(name=>({name,status:'passed'})));assert.deepEqual(j.networkFailures,[]);assert.deepEqual(j.pageErrors,[]);
  const manifest=sha(readFileSync(out+'/runtime-files.json'));assert.equal(build.distManifestSHA256,manifest);assert.equal(j.runtimeManifestSha256,manifest);const served=files(out+'/runtime');for(const[k,v]of Object.entries(JSON.parse(readFileSync(out+'/runtime-files.json'))))assert.equal(served[k],v);
  const matrix=['researcher-tools-1440','researcher-data-1440','researcher-tools-390','researcher-data-390','participant-1440','participant-390','participant-media-390'];assert.deepEqual(j.layouts.map(a=>a.name).sort(),matrix.sort());
  for(const a of j.layouts){assert.equal(a.width,Number(a.name.split('-').at(-1)));assert.equal(a.overflow,false);assert.ok(a.passes>0);assert.deepEqual(a.violations,[]);const png=readFileSync(out+'/browser/screenshots/'+a.name+'.png');assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);}
  assert.deepEqual(j.keyboardFocus.map(k=>[k.name,k.width,k.tag]),[['researcher-tabs',1440,'BUTTON'],['researcher-tabs',390,'BUTTON'],['participant-auto-next',1440,'FIELDSET'],['participant-auto-next',390,'FIELDSET']]);for(const k of j.keyboardFocus){assert.equal(k.focusVisible,true);assert.equal(k.outlineStyle,'solid');assert.ok(parseFloat(k.outlineWidth)>0);}
  assert.equal(j.secureContextFeatures,'not-tested');assert.ok(j.browserVersion);writeFileSync(out+'/acceptance.json',JSON.stringify({status:'PASS',sourceCommit:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,local:'explicitly reviewed unsigned evidence; no CI test rerun',browser:'new synthetic API UI only',runtimeManifestSHA256:manifest,sameRunBackendClaim:false},null,2));return;
 }
 throw Error('Unknown Survey mode');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main(process.argv[2]);
