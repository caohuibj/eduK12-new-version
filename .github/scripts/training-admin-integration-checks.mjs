import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {binding,trainingAdminIntegrationPlan} from './training-admin-integration-scope.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const objects=new Map();const git=(...a)=>{const key=JSON.stringify(a);if(!objects.has(key))objects.set(key,execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim());return objects.get(key)};
const output='training-admin-integration-evidence';
const receipt=(name,data)=>{mkdirSync(output,{recursive:true});writeFileSync(`${output}/${name}.json`,JSON.stringify(data,null,2)+'\n')};
export function verifyReviewedEvidence(read=readFileSync,object=git){
 const bytes=read('.github/evidence/training-admin-integration/reviewed-local.json');assert.equal(sha(bytes),binding.evidenceSHA256,'Reviewed evidence drift');
 const e=JSON.parse(bytes);assert.equal(e.kind,'reviewed-local-evidence');assert.equal(e.ciExecuted,false);assert.equal(e.originalExecutionSigned,false);
 const reports={};for(const [id,r]of Object.entries(e.reports)){const raw=gunzipSync(Buffer.from(r.gzipBase64,'base64'),{maxOutputLength:8*1024*1024});assert.equal(raw.length,r.bytes);assert.equal(sha(raw),r.sha256);reports[id]=JSON.parse(raw)}
 assert.equal(reports.courseExit.exitCode,0);assert.equal(reports.course.numFailedTests,0);assert.equal(reports.course.numPassedTests,16);
 const suite=reports.course.testResults.find(x=>x.name.endsWith('/src/training/TrainingAdminCourses.test.tsx'));assert.equal(suite.assertionResults.length,16);assert(suite.assertionResults.every(x=>x.status==='passed'));
 for(const [file,blob]of Object.entries(e.courseInputs)){assert.equal(object('rev-parse',e.source+':'+file),blob);assert.equal(object('rev-parse','HEAD:'+file),blob,'Reused course input changed: '+file)}
 for(const [file,digest]of Object.entries(e.testedSourceSHA256))assert.equal(sha(read(file)),digest,'Original course input changed: '+file);
 assert.equal(reports.courseLint.exitCode,0);assert.equal(reports.resourceChecks.find(x=>x.name==='lint').exitCode,0);
 for(const [file,digest]of Object.entries(e.lintInputs))assert.equal(sha(read(file)),digest,'Reused lint input changed: '+file);
 for(const [file,blob]of Object.entries(e.lintConfigInputs))assert.equal(object('rev-parse','HEAD:'+file),blob,'Reused lint configuration changed');
 for(const [file,digest]of Object.entries(e.controlSHA256))assert.equal(sha(read(file)),digest,'Reviewed qualification control drift: '+file);
 assert.deepEqual(Object.keys(e.controlSHA256).sort(),binding.controls.filter(f=>f!=='.github/scripts/training-admin-integration-bindings.json'&&!f.startsWith('.github/evidence/')).sort());
 const c=e.controlObservation;assert.equal(c.exitCode,1);assert.equal(c.passed,23);assert.equal(c.total,24);assert.equal(c.acceptedUnchangedCases,21);
 const old=gunzipSync(Buffer.from(c.testSourceGzipBase64,'base64'));assert.equal(sha(old),c.testSourceSHA256);
 const unaffected=text=>text.split('\n').filter(line=>!c.invalidatedCases.some(name=>line.startsWith("test('"+name+"'"))).join('\n');
 assert.equal(unaffected(old.toString()),unaffected(read('.github/scripts/training-admin-integration.test.mjs').toString()),'Unchanged control assertions drifted');
 assert.equal(sha(read('.github/scripts/training-admin-integration-scope.mjs')),c.scopeSHA256);assert.equal(sha(read('.github/scripts/merge-gate.mjs')),c.gateSHA256);
 const stable=Object.fromEntries(Object.entries(binding).filter(([k])=>k!=='evidenceSHA256').sort(([a],[b])=>a.localeCompare(b)));
 // JSON ordering is reconstructed recursively as recorded by the local freeze.
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
 assert.equal(sha(Buffer.from(JSON.stringify(canonical(stable)))),c.bindingWithoutEvidenceSHA256,'Control binding drift');

 return {kind:e.kind,ciExecuted:false,originalExecutionSigned:false,acceptedCases:16,acceptedUnchangedControlCases:21,acceptedLintFiles:Object.keys(e.lintInputs),limits:e.limits};
}
export function verifyTests(report,files){
 assert.equal(report.success,true);assert.equal(report.numFailedTests,0);assert.equal(report.numPendingTests,0);assert.equal(report.numTodoTests,0);
 const normalized=s=>s.replace(/\\/g,'/').split('/src/').at(-1);
 assert.deepEqual(report.testResults.map(s=>normalized(s.name)).sort(),files.map(f=>f.replace(/^src\//,'')).sort());
 for(const s of report.testResults){assert.equal(s.status,'passed');assert(s.assertionResults.length);assert(s.assertionResults.every(x=>x.status==='passed'))}
 return {cases:report.numPassedTests,files:files.length};
}
const run=(args,cwd)=>execFileSync(process.execPath,args,{cwd,stdio:'inherit',timeout:300000});
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.version,'v24.21.0');const action=process.argv[2];
 if(action==='admission'){
  const {changedEntries}=await import('./content-scope.mjs');const head=git('rev-parse','HEAD');assert.deepEqual(trainingAdminIntegrationPlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));receipt('admission',{...verifyReviewedEvidence(),head});
 }else if(action==='frontend'||action==='backend'){
  const files=binding[action+'Tests'];assert(files.length);assert(files.every(f=>/^src\/[A-Za-z0-9_./-]+\.test\.tsx?$/.test(f)));
  if(action==='frontend'){
   const accepted=new Set(Object.keys(JSON.parse(readFileSync('.github/evidence/training-admin-integration/reviewed-local.json')).lintInputs));
   const changed=Object.keys(binding.source).filter(f=>f.startsWith('server-version/frontend/src/')&&/\.tsx?$/.test(f)&&!accepted.has(f)).map(f=>f.replace('server-version/frontend/',''));
   run(['node_modules/eslint/bin/eslint.js',...changed],'server-version/frontend');
  }
  const file=resolve(output,action+'-tests.json');mkdirSync(output,{recursive:true});
  run(['node_modules/vitest/vitest.mjs','run',...files,'--maxWorkers=2','--reporter=default','--reporter=json','--outputFile='+file],'server-version/'+action);
  receipt(action+'-verified',verifyTests(JSON.parse(readFileSync(file)),files));
 }else if(action==='codeql-config'){
  const paths=[...Object.keys(binding.source),...binding.controls].filter(f=>/\.[cm]?[jt]sx?$/.test(f));assert(paths.length>20);writeFileSync(process.env.GITHUB_OUTPUT,`config=${JSON.stringify({paths})}\n`,{flag:'a'});
 }else throw Error('Unknown bounded action');
}
