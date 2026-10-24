import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {binding,surveyAssessmentPlan} from './survey-assessment-scope.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const output='survey-assessment-evidence';
const receipt=(name,value)=>{mkdirSync(output,{recursive:true});writeFileSync(`${output}/${name}.json`,JSON.stringify(value,null,2)+'\n');};

export function verifyBuildEvidence(read=readFileSync,blob=(file)=>git('rev-parse','HEAD:'+file)){
 const raw=read('.github/evidence/survey-assessment/build.json');assert.equal(sha(raw),binding.buildEvidenceSHA256);
 const e=JSON.parse(raw);assert.equal(e.kind,'reviewed-local-build-and-browser-observation');assert.equal(e.ciExecuted,false);assert.equal(e.originalExecutionSigned,false);
 assert.equal(e.frontendTree,binding.components.frontend);assert.equal(e.node,'v24.21.0');assert.equal(e.vite,'6.4.4');
 for(const [file,id]of Object.entries(e.inputs))assert.equal(blob(file),id,'Built input drift: '+file);
 for(const [file,digest]of Object.entries(e.controlSHA256))assert.equal(sha(read(file)),digest,'Reviewed qualification control drift: '+file);
 assert.equal(Object.keys(e.inputs).length,binding.frontendBuildInputCount,'Complete frontend input manifest required');assert(binding.frontendBuildInputCount>500);
 for(const variant of e.builds){
  assert.equal(variant.name,'default');assert.equal(variant.exitCode,0);
  const log=gunzipSync(Buffer.from(variant.logGzipBase64,'base64'),{maxOutputLength:2*1024*1024});assert.equal(sha(log),variant.logSHA256);assert.match(log.toString(),/built in [0-9.]+s/);
  assert(Object.keys(variant.artifactFiles).length>500);for(const [file,digest]of Object.entries(variant.artifactFiles)){assert(!file.startsWith('/')&&!file.split('/').includes('..'));assert.match(digest,/^[a-f0-9]{64}$/);}
 }
 assert.equal(e.builds.length,1);assert.deepEqual(e.builds.map(b=>b.name),['default']);
 return {kind:e.kind,frontendTree:e.frontendTree,ciExecuted:false,originalExecutionSigned:false,builds:e.builds.map(b=>({name:b.name,files:Object.keys(b.artifactFiles).length})),limits:e.limits};
}

export function verifyTests(report,files){
 assert.equal(report.success,true);assert.equal(report.numFailedTests,0);assert.equal(report.numPendingTests,0);assert.equal(report.numTodoTests,0);
 const actual=report.testResults.map(s=>s.name.split('/src/').at(-1));assert.deepEqual(actual.sort(),files.map(f=>f.slice(4)).sort(),'Missing or unexpected affected test file');
 const cases=report.testResults.flatMap(s=>s.assertionResults);assert(cases.length>0);assert(cases.every(c=>c.status==='passed'));return {files:files.length,cases:cases.length};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.version,'v24.21.0');const action=process.argv[2];
 if(action==='admission'){
  const{changedEntries}=await import('./content-scope.mjs');const head=git('rev-parse','HEAD');
  assert.deepEqual(surveyAssessmentPlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));
  receipt('build-admission',verifyBuildEvidence());
 }else if(action==='frontend'||action==='backend'){
  const files=binding.checks[action+'TestFiles'];assert(Array.isArray(files)&&files.length>0&&files.every(f=>/^src\/[\w/.-]+\.test\.(ts|tsx)$/.test(f)));
  mkdirSync(output,{recursive:true});const target=`${output}/${action}-tests.json`;
  execFileSync(process.execPath,['node_modules/vitest/vitest.mjs','run',...files,'--maxWorkers=2','--reporter=json',`--outputFile=../../${target}`],{cwd:'server-version/'+action,stdio:'inherit'});
  receipt(action+'-assertions',verifyTests(JSON.parse(readFileSync(target)),files));
 }else throw Error('Unknown Survey assessment check');
}
